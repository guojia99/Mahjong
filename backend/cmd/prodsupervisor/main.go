// prodsupervisor runs backend + gateway in production mode, monitors ports,
// restarts on failure, and logs errors to a file. Stops after 10 failures in 5 minutes.
package main

import (
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"sync"
	"syscall"
	"time"
)

const (
	checkInterval = 2 * time.Second
	maxFailures   = 10
	failureWindow = 5 * time.Minute
)

func main() {
	var (
		backendBin   string
		gatewayBin   string
		configPath   string
		staticDir    string
		backendPort  int
		gatewayPort  int
		logPath      string
	)
	flag.StringVar(&backendBin, "backend-bin", "./mahjong-backend", "backend binary path")
	flag.StringVar(&gatewayBin, "gateway-bin", "./mahjong-gateway", "gateway binary path")
	flag.StringVar(&configPath, "config", "db_config.json", "backend config file")
	flag.StringVar(&staticDir, "static-dir", "../frontend/dist", "frontend dist directory")
	flag.IntVar(&backendPort, "backend-port", 9997, "backend listen port")
	flag.IntVar(&gatewayPort, "gateway-port", 9999, "unified gateway port")
	flag.StringVar(&logPath, "log", "/tmp/mahjong_dev.log", "error log file path")
	flag.Parse()

	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		log.Fatalf("open log %s: %v", logPath, err)
	}
	defer logFile.Close()

	logger := newFileLogger(logFile)
	logger.log("prodsupervisor starting backend_port=%d gateway_port=%d", backendPort, gatewayPort)

	absStatic, err := filepath.Abs(staticDir)
	if err != nil {
		logger.fatal("static dir: %v", err)
	}
	if st, err := os.Stat(absStatic); err != nil || !st.IsDir() {
		logger.fatal("static dir missing: %s (run make build-prod first)", absStatic)
	}

	backendArgs := []string{"--config", configPath, "--port", fmt.Sprintf("%d", backendPort)}
	gatewayArgs := []string{
		"--port", fmt.Sprintf("%d", gatewayPort),
		"--backend", fmt.Sprintf("http://127.0.0.1:%d", backendPort),
		"--static", absStatic,
	}

	backend := newManaged("backend", backendBin, backendArgs, backendPort, logger, logFile)
	gateway := newManaged("gateway", gatewayBin, gatewayArgs, gatewayPort, logger, logFile)

	if err := backend.start(); err != nil {
		logger.fatal("start backend: %v", err)
	}
	// Gateway needs backend API; brief wait then start.
	time.Sleep(500 * time.Millisecond)
	if err := gateway.start(); err != nil {
		logger.fatal("start gateway: %v", err)
	}

	fmt.Println()
	fmt.Printf("  App (production): http://127.0.0.1:%d\n", gatewayPort)
	fmt.Printf("  Backend (internal): http://127.0.0.1:%d\n", backendPort)
	fmt.Printf("  Log: %s\n", logPath)
	fmt.Println()

	stop := make(chan struct{})
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		runMonitor(backend, gateway, logger, stop)
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh
	logger.log("shutdown signal received")
	close(stop)
	backend.stop()
	gateway.stop()
	wg.Wait()
	logger.log("prodsupervisor stopped")
}

type fileLogger struct {
	mu  sync.Mutex
	out io.Writer
}

func newFileLogger(w io.Writer) *fileLogger {
	return &fileLogger{out: w}
}

func (l *fileLogger) log(format string, args ...any) {
	l.mu.Lock()
	defer l.mu.Unlock()
	line := fmt.Sprintf("%s %s\n", time.Now().Format(time.RFC3339), fmt.Sprintf(format, args...))
	_, _ = l.out.Write([]byte(line))
	fmt.Print(line)
}

func (l *fileLogger) fatal(format string, args ...any) {
	l.log("FATAL "+format, args...)
	os.Exit(1)
}

type managedProc struct {
	name       string
	bin        string
	args       []string
	port       int
	logger     *fileLogger
	logFile    *os.File
	mu         sync.Mutex
	cmd        *exec.Cmd
}

func newManaged(name, bin string, args []string, port int, logger *fileLogger, logFile *os.File) *managedProc {
	return &managedProc{name: name, bin: bin, args: args, port: port, logger: logger, logFile: logFile}
}

func (m *managedProc) start() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.cmd != nil {
		if m.cmd.Process != nil {
			_ = m.cmd.Process.Kill()
		}
		_ = m.cmd.Wait()
		m.cmd = nil
	}

	cmd := exec.Command(m.bin, m.args...)
	cmd.Stdout = m.logFile
	cmd.Stderr = m.logFile
	if err := cmd.Start(); err != nil {
		return err
	}
	m.cmd = cmd
	m.logger.log("[%s] started pid=%d port=%d", m.name, cmd.Process.Pid, m.port)
	return nil
}

func (m *managedProc) stop() {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.cmd != nil && m.cmd.Process != nil {
		_ = m.cmd.Process.Signal(syscall.SIGTERM)
		done := make(chan struct{})
		go func() {
			_ = m.cmd.Wait()
			close(done)
		}()
		select {
		case <-done:
		case <-time.After(3 * time.Second):
			_ = m.cmd.Process.Kill()
		}
	}
	m.cmd = nil
}

func (m *managedProc) alive() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.cmd == nil || m.cmd.Process == nil {
		return false
	}
	// Signal 0 checks process exists without killing it.
	return m.cmd.Process.Signal(syscall.Signal(0)) == nil
}

func portListening(port int) bool {
	conn, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", port), time.Second)
	if err != nil {
		return false
	}
	_ = conn.Close()
	return true
}

func runMonitor(backend, gateway *managedProc, logger *fileLogger, stop <-chan struct{}) {
	var failureTimes []time.Time

	recordFailure := func(msg string, args ...any) bool {
		now := time.Now()
		failureTimes = append(failureTimes, now)
		cutoff := now.Add(-failureWindow)
		pruned := failureTimes[:0]
		for _, t := range failureTimes {
			if t.After(cutoff) {
				pruned = append(pruned, t)
			}
		}
		failureTimes = pruned
		logger.log(msg, args...)
		if len(failureTimes) >= maxFailures {
			logger.log("too many failures (%d in %s), giving up", maxFailures, failureWindow)
			os.Exit(1)
		}
		return true
	}

	ticker := time.NewTicker(checkInterval)
	defer ticker.Stop()

	for {
		select {
		case <-stop:
			return
		case <-ticker.C:
			if !backend.alive() || !portListening(backend.port) {
				recordFailure("[%s] down (alive=%v port=%v), restarting", backend.name, backend.alive(), portListening(backend.port))
				if err := backend.start(); err != nil {
					recordFailure("[%s] restart failed: %v", backend.name, err)
				}
				time.Sleep(500 * time.Millisecond)
			}
			if !gateway.alive() || !portListening(gateway.port) {
				recordFailure("[%s] down (alive=%v port=%v), restarting", gateway.name, gateway.alive(), portListening(gateway.port))
				if err := gateway.start(); err != nil {
					recordFailure("[%s] restart failed: %v", gateway.name, err)
				}
			}
		}
	}
}
