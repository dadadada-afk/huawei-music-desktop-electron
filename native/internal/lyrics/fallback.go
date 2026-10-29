package lyrics

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"math"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode"
)

type Query struct {
	Title, Artist string
	Duration      float64
}
type Candidate struct {
	Title, Artist, Hash, ID, Key, Text string
	Duration                           float64
}

var brackets = regexp.MustCompile(`[\(\[【（][^\)\]】）]*[\)\]】）]`)

func normalized(s string) string {
	return strings.Map(func(r rune) rune {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			return unicode.ToLower(r)
		}
		return -1
	}, brackets.ReplaceAllString(s, ""))
}
func candidateScore(c Candidate, q Query) float64 {
	title, wanted := normalized(c.Title), normalized(q.Title)
	if title == "" || wanted == "" {
		return 0
	}
	exact := title == wanted
	closeDuration := c.Duration > 30 && q.Duration > 30 && math.Abs(c.Duration-q.Duration) <= 8
	if !exact && (!(strings.Contains(title, wanted) || strings.Contains(wanted, title)) || !closeDuration) {
		return 0
	}
	artist := false
	for _, name := range strings.FieldsFunc(c.Artist, func(r rune) bool { return strings.ContainsRune("、/&,;", r) }) {
		for _, want := range strings.FieldsFunc(q.Artist, func(r rune) bool { return strings.ContainsRune("、/&,;", r) }) {
			if normalized(name) != "" && normalized(name) == normalized(want) {
				artist = true
			}
		}
	}
	if q.Artist != "" && !artist {
		return 0
	}
	score := .9
	if exact {
		score = 1.3
	}
	if artist {
		score += .9
	}
	if closeDuration {
		score += .3
	}
	if c.Duration > 30 && q.Duration > 30 && math.Abs(c.Duration-q.Duration) > 25 {
		score -= .5
	}
	return score
}
func pick(candidates []Candidate, q Query) *Candidate {
	var best *Candidate
	score := 1.5
	for _, c := range candidates {
		if next := candidateScore(c, q); next >= score {
			copy := c
			best = &copy
			score = next
		}
	}
	return best
}

// Only lyric metadata/text is requested. No music session or audio URL enters
// the public fallback providers, and redirects are rejected.
func readJSON(ctx context.Context, raw string, out any) error {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" {
		return errors.New("invalid lyric URL")
	}
	switch u.Host {
	case "songsearch.kugou.com", "krcs.kugou.com", "lyrics.kugou.com", "lrclib.net":
	default:
		return errors.New("lyric host rejected")
	}
	client := http.Client{Timeout: 8 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return errors.New("lyric redirect rejected") }}
	r, err := http.NewRequestWithContext(ctx, http.MethodGet, raw, nil)
	if err != nil {
		return errors.New("lyric request invalid")
	}
	r.Header.Set("User-Agent", "HuaweiMusicDesktop/0.0.1 (unofficial study client)")
	r.Header.Set("Referer", "https://www.kugou.com/")
	response, err := client.Do(r)
	if err != nil {
		return errors.New("lyric request failed")
	}
	defer response.Body.Close()
	if response.StatusCode != 200 {
		return errors.New("lyric HTTP failure")
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, 512*1024+1))
	if err != nil || len(data) > 512*1024 {
		return errors.New("lyric response too large")
	}
	return json.Unmarshal(data, out)
}
func Fallback(ctx context.Context, q Query) (string, string) {
	if strings.TrimSpace(q.Title) == "" {
		return "", ""
	}
	var search struct {
		Data struct {
			Lists []struct {
				Title    string  `json:"SongName"`
				Artist   string  `json:"SingerName"`
				Duration float64 `json:"Duration"`
				Hash     string  `json:"FileHash"`
			} `json:"lists"`
		} `json:"data"`
	}
	params := url.Values{"keyword": {q.Title + " " + q.Artist}, "page": {"1"}, "pagesize": {"20"}, "platform": {"WebFilter"}, "userid": {"0"}, "clientver": {"2000"}, "iscorrection": {"1"}, "privilege_filter": {"0"}, "filter": {"10"}}
	if readJSON(ctx, "https://songsearch.kugou.com/song_search_v2?"+params.Encode(), &search) == nil {
		var candidates []Candidate
		for _, c := range search.Data.Lists {
			if c.Hash != "" {
				candidates = append(candidates, Candidate{Title: c.Title, Artist: c.Artist, Duration: c.Duration, Hash: c.Hash})
			}
		}
		if match := pick(candidates, q); match != nil {
			var index struct {
				Candidates []struct {
					ID       json.Number `json:"id"`
					Key      string      `json:"accesskey"`
					Title    string      `json:"song"`
					Artist   string      `json:"singer"`
					Duration float64     `json:"duration"`
				} `json:"candidates"`
			}
			if readJSON(ctx, "https://krcs.kugou.com/search?"+url.Values{"ver": {"1"}, "man": {"yes"}, "client": {"mobi"}, "hash": {match.Hash}}.Encode(), &index) == nil {
				var choices []Candidate
				for _, c := range index.Candidates {
					choices = append(choices, Candidate{ID: c.ID.String(), Key: c.Key, Title: c.Title, Artist: c.Artist, Duration: c.Duration / 1000})
				}
				if choice := pick(choices, q); choice != nil && choice.ID != "" && choice.Key != "" {
					var result struct {
						Content string `json:"content"`
					}
					if readJSON(ctx, "https://lyrics.kugou.com/download?"+url.Values{"ver": {"1"}, "client": {"pc"}, "id": {choice.ID}, "accesskey": {choice.Key}, "fmt": {"lrc"}, "charset": {"utf8"}}.Encode(), &result) == nil {
						data, err := base64.StdEncoding.DecodeString(result.Content)
						if err == nil && len(Parse(string(data))) > 0 {
							return strings.TrimPrefix(string(data), "\ufeff"), "酷狗歌词"
						}
					}
				}
			}
		}
	}
	var rows []struct {
		Title        string  `json:"trackName"`
		Artist       string  `json:"artistName"`
		Duration     float64 `json:"duration"`
		Synced       string  `json:"syncedLyrics"`
		Plain        string  `json:"plainLyrics"`
		Instrumental bool    `json:"instrumental"`
	}
	if readJSON(ctx, "https://lrclib.net/api/search?"+url.Values{"q": {q.Title + " " + q.Artist}}.Encode(), &rows) == nil {
		var candidates []Candidate
		for _, r := range rows {
			if r.Instrumental {
				continue
			}
			text := r.Synced
			if text == "" {
				text = r.Plain
			}
			if len(Parse(text)) > 0 {
				candidates = append(candidates, Candidate{Title: r.Title, Artist: r.Artist, Duration: r.Duration, Text: text})
			}
		}
		if c := pick(candidates, q); c != nil {
			return c.Text, "LRCLIB"
		}
	}
	return "", ""
}
