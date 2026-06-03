package middleware

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

const queryCacheTTL = 15 * time.Minute

type cachedResponse struct {
	statusCode  int
	contentType string
	body        []byte
	expiresAt   time.Time
}

var (
	queryCacheMu sync.RWMutex
	queryCache   = make(map[string]cachedResponse)
)

// cacheablePostPaths are POST handlers that only read data (not mutations).
var cacheablePostPaths = map[string]struct{}{
	"/api/v1/players/batch-avatars/":      {},
	"/api/v1/games/online/parse-batch/": {},
}

// gameWritePaths invalidate the query cache after a successful response.
var gameWritePaths = map[string]struct{}{
	"/api/v1/games/online/":                      {},
	"/api/v1/games/online/retry/:pk/":            {},
	"/api/v1/games/:pk/":                         {},
	"/api/v1/games/:pk/scores/":                  {},
	"/api/v1/games/:pk/players/":                 {},
	"/api/v1/games/:pk/shuffle-seats/":           {},
	"/api/v1/games/:pk/hand-records/":            {},
	"/api/v1/games/:pk/hand-records/:record_pk/": {},
	"/api/v1/rooms/:pk/games/":                   {},
}

// playerWritePaths invalidate cached player lists and related reads.
var playerWritePaths = map[string]struct{}{
	"/api/v1/players":                                  {},
	"/api/v1/players/:pk/":                             {},
	"/api/v1/players/:pk/majsoul-accounts/":            {},
	"/api/v1/players/majsoul-accounts/:account_pk/":    {},
}

func buildQueryCacheKey(method, path, rawQuery string, body []byte, authToken, xToken string) string {
	h := sha256.New()
	_, _ = h.Write([]byte(method))
	_, _ = h.Write([]byte{'\n'})
	_, _ = h.Write([]byte(path))
	_, _ = h.Write([]byte{'\n'})
	_, _ = h.Write([]byte(rawQuery))
	_, _ = h.Write([]byte{'\n'})
	if authToken != "" {
		_, _ = h.Write([]byte(authToken))
		_, _ = h.Write([]byte{'\n'})
	}
	if xToken != "" {
		_, _ = h.Write([]byte(xToken))
		_, _ = h.Write([]byte{'\n'})
	}
	_, _ = h.Write(body)
	return hex.EncodeToString(h.Sum(nil))
}

func getCachedResponse(key string) (cachedResponse, bool) {
	now := time.Now()
	queryCacheMu.RLock()
	entry, ok := queryCache[key]
	queryCacheMu.RUnlock()
	if !ok {
		return cachedResponse{}, false
	}
	if now.After(entry.expiresAt) {
		queryCacheMu.Lock()
		delete(queryCache, key)
		queryCacheMu.Unlock()
		return cachedResponse{}, false
	}
	return entry, true
}

func setCachedResponse(key string, entry cachedResponse) {
	queryCacheMu.Lock()
	queryCache[key] = entry
	queryCacheMu.Unlock()
}

// InvalidateQueryCache clears all cached query responses.
func InvalidateQueryCache() {
	queryCacheMu.Lock()
	queryCache = make(map[string]cachedResponse)
	queryCacheMu.Unlock()
}

func isCacheableMethod(c *gin.Context) bool {
	switch c.Request.Method {
	case http.MethodGet, http.MethodHead:
		return true
	case http.MethodPost:
		_, ok := cacheablePostPaths[c.FullPath()]
		return ok
	default:
		return false
	}
}

func invalidatesQueryCache(fullPath string) bool {
	if _, ok := gameWritePaths[fullPath]; ok {
		return true
	}
	_, ok := playerWritePaths[fullPath]
	return ok
}

type cacheCaptureWriter struct {
	gin.ResponseWriter
	body *bytes.Buffer
}

func (w *cacheCaptureWriter) Write(b []byte) (int, error) {
	if w.body != nil {
		_, _ = w.body.Write(b)
	}
	return w.ResponseWriter.Write(b)
}

// QueryCache caches successful read responses for 15 minutes.
// Cache keys are derived from method, URL path, query string, request body, and auth headers.
func QueryCache() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !isCacheableMethod(c) {
			c.Next()
			return
		}

		var body []byte
		if c.Request.Body != nil {
			body, _ = io.ReadAll(c.Request.Body)
			c.Request.Body = io.NopCloser(bytes.NewReader(body))
		}

		authToken := c.GetHeader("Authorization")
		xToken := c.GetHeader("X-Token")
		key := buildQueryCacheKey(
			c.Request.Method,
			c.Request.URL.Path,
			c.Request.URL.RawQuery,
			body,
			authToken,
			xToken,
		)

		if entry, ok := getCachedResponse(key); ok {
			if c.Request.Method == http.MethodHead {
				c.Status(entry.statusCode)
				c.Abort()
				return
			}
			c.Data(entry.statusCode, entry.contentType, entry.body)
			c.Abort()
			return
		}

		capture := &cacheCaptureWriter{ResponseWriter: c.Writer, body: &bytes.Buffer{}}
		c.Writer = capture
		c.Next()

		if c.Writer.Status() != http.StatusOK {
			return
		}
		if c.Request.Method == http.MethodHead {
			setCachedResponse(key, cachedResponse{
				statusCode: c.Writer.Status(),
				expiresAt:  time.Now().Add(queryCacheTTL),
			})
			return
		}
		if capture.body.Len() == 0 {
			return
		}

		contentType := c.Writer.Header().Get("Content-Type")
		if contentType == "" {
			contentType = "application/json; charset=utf-8"
		}
		setCachedResponse(key, cachedResponse{
			statusCode:  c.Writer.Status(),
			contentType: contentType,
			body:        bytes.Clone(capture.body.Bytes()),
			expiresAt:   time.Now().Add(queryCacheTTL),
		})
	}
}

// InvalidateQueryCacheAfterGameWrite clears the query cache after a successful game write.
func InvalidateQueryCacheAfterGameWrite() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()
		if c.Writer.Status() < http.StatusOK || c.Writer.Status() >= http.StatusMultipleChoices {
			return
		}
		switch c.Request.Method {
		case http.MethodPost, http.MethodPut, http.MethodDelete, http.MethodPatch:
		default:
			return
		}
		if invalidatesQueryCache(c.FullPath()) {
			InvalidateQueryCache()
		}
	}
}
