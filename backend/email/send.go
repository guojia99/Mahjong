package email

import (
	"bytes"
	"crypto/tls"
	"fmt"
	"log"
	"net"
	"net/smtp"
	"strings"

	"mahjong-backend/config"
)

const logoURL = "https://www.majsoul.tw/homepage/character/1/yiji_0.png"

func purposeTitle(purpose string) (subject, heading, body string) {
	switch purpose {
	case "bind_email":
		return "绑定邮箱验证码", "绑定邮箱", "您正在绑定邮箱，请使用以下验证码完成验证。"
	case "change_email":
		return "修改邮箱验证码", "修改邮箱", "您正在修改邮箱，请使用以下验证码完成验证。"
	default:
		return "重置密码验证码", "重置密码", "您正在重置密码，请使用以下验证码完成验证。"
	}
}

func renderHTML(heading, bodyText, code string) string {
	return fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:linear-gradient(135deg,#fef9f4 0%%,#f5cde0 50%%,#d0eef7 100%%);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table width="100%%" style="max-width:480px;background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(232,160,191,0.25);overflow:hidden;">
        <tr><td style="padding:32px 24px;text-align:center;background:linear-gradient(135deg,#fef9f4,#f5cde0);">
          <img src="%s" alt="Logo" width="72" height="72" style="border-radius:50%%;object-fit:cover;" />
          <h1 style="margin:12px 0 0;font-size:20px;color:#c06090;">Mahjong Assistant</h1>
        </td></tr>
        <tr><td style="padding:28px 24px;">
          <h2 style="margin:0 0 12px;font-size:18px;color:#333;">%s</h2>
          <p style="margin:0 0 20px;color:#666;font-size:14px;line-height:1.6;">%s</p>
          <div style="text-align:center;margin:24px 0;">
            <span style="display:inline-block;padding:16px 32px;background:#f5cde0;border-radius:12px;font-size:28px;font-weight:bold;letter-spacing:6px;color:#c06090;">%s</span>
          </div>
          <p style="margin:0;color:#999;font-size:12px;text-align:center;">验证码 10 分钟内有效，请勿泄露给他人。</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`, logoURL, heading, bodyText, code)
}

// SendVerificationEmail sends an HTML verification email for the given purpose.
func SendVerificationEmail(to, purpose, code string) error {
	cfg := config.Cfg.EmailConfig
	if !cfg.Enabled() {
		log.Printf("[email] SMTP not configured; verification code for %s (%s): %s", to, purpose, code)
		return fmt.Errorf("email service not configured")
	}
	subject, heading, bodyText := purposeTitle(purpose)
	html := renderHTML(heading, bodyText, code)

	fromAddr := cfg.From
	fromName := cfg.FromName
	if fromName == "" {
		fromName = "Mahjong Assistant"
	}
	port := cfg.SMTPPort
	if port == 0 {
		port = 587
	}

	msg := buildMessage(fromAddr, fromName, to, subject, html)
	addr := fmt.Sprintf("%s:%d", cfg.SMTPHost, port)

	if port == 465 {
		return sendTLS(addr, cfg.SMTPHost, cfg.From, cfg.Password, to, msg)
	}
	auth := smtp.PlainAuth("", cfg.From, cfg.Password, cfg.SMTPHost)
	return smtp.SendMail(addr, auth, fromAddr, []string{to}, []byte(msg))
}

func buildMessage(from, fromName, to, subject, html string) string {
	var buf bytes.Buffer
	buf.WriteString(fmt.Sprintf("From: %s <%s>\r\n", encodeHeader(fromName), from))
	buf.WriteString(fmt.Sprintf("To: %s\r\n", to))
	buf.WriteString(fmt.Sprintf("Subject: %s\r\n", encodeHeader(subject)))
	buf.WriteString("MIME-Version: 1.0\r\n")
	buf.WriteString("Content-Type: text/html; charset=UTF-8\r\n")
	buf.WriteString("\r\n")
	buf.WriteString(html)
	return buf.String()
}

func encodeHeader(s string) string {
	if strings.ContainsAny(s, "\r\n") {
		return ""
	}
	return s
}

func sendTLS(addr, host, from, password, to, msg string) error {
	conn, err := tls.Dial("tcp", addr, &tls.Config{ServerName: host})
	if err != nil {
		return err
	}
	client, err := smtp.NewClient(conn, host)
	if err != nil {
		return err
	}
	defer client.Close()

	auth := smtp.PlainAuth("", from, password, host)
	if err := client.Auth(auth); err != nil {
		return err
	}
	if err := client.Mail(from); err != nil {
		return err
	}
	if err := client.Rcpt(to); err != nil {
		return err
	}
	w, err := client.Data()
	if err != nil {
		return err
	}
	if _, err := w.Write([]byte(msg)); err != nil {
		return err
	}
	if err := w.Close(); err != nil {
		return err
	}
	return client.Quit()
}

// DialTest checks SMTP connectivity (optional helper).
func DialTest() error {
	cfg := config.Cfg.EmailConfig
	if !cfg.Enabled() {
		return fmt.Errorf("email not configured")
	}
	port := cfg.SMTPPort
	if port == 0 {
		port = 587
	}
	_, err := net.Dial("tcp", fmt.Sprintf("%s:%d", cfg.SMTPHost, port))
	return err
}
