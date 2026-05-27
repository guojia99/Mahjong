package majsoulpaipu

import "testing"

func TestNormalizeInputURL(t *testing.T) {
	raw := "雀魂牌譜:https://game.maj-soul.com/1/?paipu=260525-1c465ba0-a7da-4140-bacc-b8ee29f2b76b_a231906715"
	got := NormalizeInputURL(raw)
	want := "https://game.maj-soul.com/1/?paipu=260525-1c465ba0-a7da-4140-bacc-b8ee29f2b76b_a231906715"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestExtractUUID(t *testing.T) {
	url := "https://game.maj-soul.com/1/?paipu=260525-1c465ba0-a7da-4140-bacc-b8ee29f2b76b_a231906715"
	got := ExtractUUID(url)
	want := "260525-1c465ba0-a7da-4140-bacc-b8ee29f2b76b"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestExtractUUID_shellEscapedURL(t *testing.T) {
	raw := `https://game.maj-soul.com/1/\?paipu\=260421-75fadb08-4d19-41ef-a928-249d428de5a4_a253935907`
	got := ExtractUUID(raw)
	want := "260421-75fadb08-4d19-41ef-a928-249d428de5a4"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestExtractUUID_bareWithAccountSuffix(t *testing.T) {
	raw := "260421-75fadb08-4d19-41ef-a928-249d428de5a4_a253935907"
	got := ExtractUUID(raw)
	want := "260421-75fadb08-4d19-41ef-a928-249d428de5a4"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestResolvePaipuUUIDs(t *testing.T) {
	uuids, err := ResolvePaipuUUIDs([]string{
		`https://game.maj-soul.com/1/\?paipu\=260421-75fadb08-4d19-41ef-a928-249d428de5a4_a253935907`,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(uuids) != 1 || uuids[0] != "260421-75fadb08-4d19-41ef-a928-249d428de5a4" {
		t.Fatalf("got %v", uuids)
	}
}
