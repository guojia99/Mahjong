package handlers

import (
	"sync"
	"testing"
)

func TestSuitShapeDPScoreConcurrent(t *testing.T) {
	counts := [9]int{1, 1, 1, 0, 0, 0, 1, 1, 1}
	var wg sync.WaitGroup
	for i := 0; i < 32; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_ = suitShapeDPScore(counts)
		}()
	}
	wg.Wait()
}
