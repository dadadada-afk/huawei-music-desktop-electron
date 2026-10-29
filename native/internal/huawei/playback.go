package huawei

import (
	"context"
	"encoding/json"
	"errors"
	"regexp"
	"strings"
	"time"
)

// Playback is transient: it must never be included in queue/profile documents.
type Playback struct {
	URL       string `json:"-"`
	Quality   string
	Duration  *float64
	LyricURL  string `json:"-"`
	LyricText string `json:"-"`
}

func (Playback) String() string   { return "[transient playback]" }
func (Playback) GoString() string { return "[transient playback]" }

func validID(id string) bool { return id != "" && len(id) <= 200 }
func (c *Client) musicPost(ctx context.Context, s *Session, path, stage string, body any, out any) error {
	if s == nil || s.token == "" || s.snsUserID == "" {
		return errors.New("music session missing")
	}
	headers, err := musicHeaders(s.token, time.Now())
	if err != nil {
		return err
	}
	data, err := json.Marshal(body)
	if err != nil {
		return errors.New("invalid music request")
	}
	return c.post(ctx, MusicEndpoint+path, stage, "application/json", data, headers, out, true)
}
func object(raw json.RawMessage) map[string]json.RawMessage {
	var text string
	if json.Unmarshal(raw, &text) == nil {
		raw = []byte(text)
	}
	var result map[string]json.RawMessage
	_ = json.Unmarshal(raw, &result)
	return result
}
func stringField(raw json.RawMessage) string {
	var value string
	_ = json.Unmarshal(raw, &value)
	return value
}
func lyricFields(raw json.RawMessage, depth int) (string, string) {
	if depth > 4 || len(raw) > 512*1024 {
		return "", ""
	}
	if text := stringField(raw); text != "" {
		if SafeResourceURL(text) {
			return text, ""
		}
		if len(text) > 0 && text[0] != '{' && text[0] != '[' {
			return "", text
		}
		if len(text) > 0 && text[0] == '[' && !json.Valid([]byte(text)) {
			return "", text
		}
	}
	obj := object(raw)
	for _, key := range []string{"lyricAddress", "lyricAddres", "lineByLineLyric", "lyric", "lyrics", "contentExInfo"} {
		if value, ok := obj[key]; ok {
			if u, t := lyricFields(value, depth+1); u != "" || t != "" {
				return u, t
			}
		}
	}
	return "", ""
}
func (c *Client) ResolvePlayback(ctx context.Context, s *Session, id, quality string) (Playback, error) {
	if !validID(id) {
		return Playback{}, errors.New("invalid track ID")
	}
	q := "1"
	if quality == "lossless" {
		q = "3"
	} else if quality != "standard" {
		return Playback{}, errors.New("unsupported quality")
	}
	var response struct {
		URL         string          `json:"fileURL"`
		Quality     json.RawMessage `json:"playQuality"`
		QualityType json.RawMessage `json:"qualityType"`
		Type        string          `json:"type"`
		Song        json.RawMessage `json:"songInfo"`
		LyricURL    string          `json:"lyricAddress"`
		Lyrics      json.RawMessage `json:"lyrics"`
		Extra       json.RawMessage `json:"contentExInfo"`
	}
	err := c.musicPost(ctx, s, "/music-play-service/v3/service/file/bycontentcode", "playback", struct {
		ID      string `json:"contentCode"`
		Type    string `json:"contentType"`
		Quality string `json:"qualityType"`
	}{id, "1", q}, &response)
	if err != nil {
		return Playback{}, err
	}
	if !SafeResourceURL(response.URL) {
		return Playback{}, errors.New("audio resource rejected")
	}
	// Validate the identity supplied with the resolved resource before opening
	// it. A missing identity is tolerated; a different track is not.
	song := object(response.Song)
	for _, key := range []string{"contentID", "contentCode"} {
		if returned := stringField(song[key]); returned != "" && returned != id {
			return Playback{}, errors.New("playback track identity mismatch")
		}
	}
	p := Playback{URL: response.URL, Quality: "unknown"}
	qualityCode := number(response.Quality)
	if qualityCode == nil {
		qualityCode = number(response.QualityType)
	}
	codec := strings.ToLower(strings.TrimSpace(response.Type))
	if qualityCode != nil {
		if *qualityCode == 3 && flacCodec.MatchString(codec) {
			p.Quality = "lossless"
		}
		if *qualityCode == 1 && !flacCodec.MatchString(codec) && (mp3Codec.MatchString(codec) || codec == "audio/mpeg") {
			p.Quality = "standard"
		}
	}
	p.Duration = number(song["duration"])
	if SafeResourceURL(response.LyricURL) {
		p.LyricURL = response.LyricURL
	} else {
		for _, raw := range []json.RawMessage{response.Lyrics, response.Extra, response.Song} {
			p.LyricURL, p.LyricText = lyricFields(raw, 0)
			if p.LyricURL != "" || p.LyricText != "" {
				break
			}
		}
	}
	return p, nil
}

var flacCodec = regexp.MustCompile(`\bflac\b`)
var mp3Codec = regexp.MustCompile(`\bmp3\b`)
