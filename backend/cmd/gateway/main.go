// mahjong-gateway serves the production frontend (static dist) on one port
// and reverse-proxies /api and /media to the backend.
package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

func main() {
	var (
		listenPort  int
		backendURL  string
		staticDir   string
	)
	flag.IntVar(&listenPort, "port", 9999, "listen port (unified entry)")
	flag.StringVar(&backendURL, "backend", "http://127.0.0.1:9997", "backend base URL")
	flag.StringVar(&staticDir, "static", "../frontend/dist", "frontend dist directory")
	flag.Parse()

	absStatic, err := filepath.Abs(staticDir)
	if err != nil {
		log.Fatalf("static dir: %v", err)
	}
	if st, err := os.Stat(absStatic); err != nil || !st.IsDir() {
		log.Fatalf("static dir not found: %s (run: cd frontend && npm run build)", absStatic)
	}

	target, err := url.Parse(backendURL)
	if err != nil {
		log.Fatalf("backend URL: %v", err)
	}

	proxy := httputil.NewSingleHostReverseProxy(target)
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		log.Printf("[gateway] proxy error %s %s: %v", r.Method, r.URL.Path, err)
		http.Error(w, "Bad Gateway", http.StatusBadGateway)
	}

	fileServer := http.FileServer(http.Dir(absStatic))
	indexPath := filepath.Join(absStatic, "index.html")

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := r.URL.Path
		if strings.HasPrefix(p, "/api/") || strings.HasPrefix(p, "/media/") {
			proxy.ServeHTTP(w, r)
			return
		}

		if p != "/" {
			clean := filepath.Clean(strings.TrimPrefix(p, "/"))
			if clean != "." && clean != ".." {
				full := filepath.Join(absStatic, clean)
				if info, err := os.Stat(full); err == nil && !info.IsDir() {
					fileServer.ServeHTTP(w, r)
					return
				}
			}
		}

		http.ServeFile(w, r, indexPath)
	})

	addr := fmt.Sprintf("127.0.0.1:%d", listenPort)
	log.Printf("[gateway] http://%s static=%s backend=%s", addr, absStatic, backendURL)
	if err := http.ListenAndServe(addr, handler); err != nil {
		log.Fatal(err)
	}
}
