package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestBuildQueryCacheKey_differsByQueryAndBody(t *testing.T) {
	k1 := buildQueryCacheKey("GET", "/api/v1/games/", "page=1", nil, "", "")
	k2 := buildQueryCacheKey("GET", "/api/v1/games/", "page=2", nil, "", "")
	if k1 == k2 {
		t.Fatal("expected different keys for different query strings")
	}

	k3 := buildQueryCacheKey("POST", "/api/v1/players/batch-avatars/", "", []byte(`{"ids":[1]}`), "", "")
	k4 := buildQueryCacheKey("POST", "/api/v1/players/batch-avatars/", "", []byte(`{"ids":[2]}`), "", "")
	if k3 == k4 {
		t.Fatal("expected different keys for different bodies")
	}
}

func TestQueryCache_hitAndInvalidate(t *testing.T) {
	gin.SetMode(gin.TestMode)
	InvalidateQueryCache()

	var hits int
	r := gin.New()
	r.GET("/api/v1/games/", QueryCache(), func(c *gin.Context) {
		hits++
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/games/?page=1", nil)
	w1 := httptest.NewRecorder()
	r.ServeHTTP(w1, req)
	if w1.Code != http.StatusOK || hits != 1 {
		t.Fatalf("first request: status=%d hits=%d", w1.Code, hits)
	}

	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, httptest.NewRequest(http.MethodGet, "/api/v1/games/?page=1", nil))
	if w2.Code != http.StatusOK || hits != 1 {
		t.Fatalf("cache hit expected: status=%d hits=%d body=%s", w2.Code, hits, w2.Body.String())
	}
	if w1.Body.String() != w2.Body.String() {
		t.Fatalf("cached body mismatch: %q vs %q", w1.Body.String(), w2.Body.String())
	}

	InvalidateQueryCache()
	w3 := httptest.NewRecorder()
	r.ServeHTTP(w3, httptest.NewRequest(http.MethodGet, "/api/v1/games/?page=1", nil))
	if hits != 2 {
		t.Fatalf("expected cache miss after invalidate, hits=%d", hits)
	}
}

func TestQueryCache_doesNotCacheNonOK(t *testing.T) {
	gin.SetMode(gin.TestMode)
	InvalidateQueryCache()

	var hits int
	r := gin.New()
	r.GET("/api/v1/games/", QueryCache(), func(c *gin.Context) {
		hits++
		c.JSON(http.StatusNotFound, gin.H{"error": "missing"})
	})

	r.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/api/v1/games/", nil))
	r.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/api/v1/games/", nil))
	if hits != 2 {
		t.Fatalf("non-200 responses should not be cached, hits=%d", hits)
	}
}

func TestInvalidateQueryCacheAfterGameWrite(t *testing.T) {
	gin.SetMode(gin.TestMode)
	InvalidateQueryCache()

	var readHits int
	r := gin.New()
	r.POST("/api/v1/games/online/", InvalidateQueryCacheAfterGameWrite(), func(c *gin.Context) {
		c.Status(http.StatusCreated)
	})
	r.GET("/api/v1/games/", QueryCache(), func(c *gin.Context) {
		readHits++
		c.JSON(http.StatusOK, gin.H{"n": readHits})
	})

	readBody := func() string {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/v1/games/", nil))
		return w.Body.String()
	}

	first := readBody()
	if readHits != 1 || !strings.Contains(first, `"n":1`) {
		t.Fatalf("unexpected first read: hits=%d body=%s", readHits, first)
	}
	if readBody() != first {
		t.Fatal("expected cached read response")
	}

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/v1/games/online/", nil))
	if w.Code != http.StatusCreated {
		t.Fatalf("write status=%d", w.Code)
	}

	second := readBody()
	if readHits != 2 || !strings.Contains(second, `"n":2`) {
		t.Fatalf("expected cache miss after game write: hits=%d body=%s", readHits, second)
	}
}

func TestInvalidateQueryCacheAfterPlayerWrite(t *testing.T) {
	gin.SetMode(gin.TestMode)
	InvalidateQueryCache()

	var readHits int
	r := gin.New()
	api := r.Group("/api/v1")
	players := api.Group("/players", InvalidateQueryCacheAfterGameWrite())
	players.POST("", func(c *gin.Context) {
		c.Status(http.StatusCreated)
	})
	r.GET("/api/v1/players", QueryCache(), func(c *gin.Context) {
		readHits++
		c.JSON(http.StatusOK, gin.H{"n": readHits})
	})

	readBody := func() string {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/v1/players", nil))
		return w.Body.String()
	}

	first := readBody()
	if readHits != 1 || !strings.Contains(first, `"n":1`) {
		t.Fatalf("unexpected first read: hits=%d body=%s", readHits, first)
	}
	if readBody() != first {
		t.Fatal("expected cached read response")
	}

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/v1/players", nil))
	if w.Code != http.StatusCreated {
		t.Fatalf("create player status=%d", w.Code)
	}

	second := readBody()
	if readHits != 2 || !strings.Contains(second, `"n":2`) {
		t.Fatalf("expected cache miss after player write: hits=%d body=%s", readHits, second)
	}
}
