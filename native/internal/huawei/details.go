package huawei

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

type Detail struct {
	ID, Title, CoverURL string
	Tracks              []Track
	Albums              []Album
	More                bool
	Next                int
}

func (c *Client) AlbumDetail(ctx context.Context, id string, start, limit int) (Detail, error) {
	if !validID(id) {
		return Detail{}, errors.New("invalid album ID")
	}
	if err := pagination(start, limit); err != nil {
		return Detail{}, err
	}
	headers, _ := musicHeaders("", time.Now())
	var result struct {
		Detail struct {
			Info struct {
				ID      string `json:"albumCode"`
				Title   string `json:"albumName"`
				Picture struct {
					URL    string `json:"bigImgURL"`
					Middle string `json:"middleImgURL"`
					Small  string `json:"smallImgURL"`
				} `json:"picture"`
			} `json:"albumInfo"`
			Items []json.RawMessage `json:"songSimpleInfos"`
		} `json:"albumInfoEx"`
	}
	err := c.request(ctx, http.MethodGet, MusicEndpoint+"/music-metacontent-service/v1/service/album/detail/byalbumcode?"+url.Values{"albumCode": {id}, "start": {strconv.Itoa(start)}, "limit": {strconv.Itoa(limit)}}.Encode(), "album", "application/json", nil, headers, &result, true)
	if err != nil {
		return Detail{}, err
	}
	p := pageFrom(result.Detail.Items, start, limit)
	cover := ""
	for _, raw := range []string{result.Detail.Info.Picture.URL, result.Detail.Info.Picture.Middle, result.Detail.Info.Picture.Small} {
		if SafeResourceURL(raw) {
			cover = raw
			break
		}
	}
	return Detail{ID: id, Title: result.Detail.Info.Title, CoverURL: cover, Tracks: p.Tracks, More: p.More, Next: p.Next}, nil
}
func (c *Client) ArtistDetail(ctx context.Context, id string) (Detail, error) {
	if !validID(id) {
		return Detail{}, errors.New("invalid artist ID")
	}
	headers, _ := musicHeaders("", time.Now())
	body, _ := json.Marshal(struct {
		ID     string `json:"artistCode"`
		Songs  int    `json:"songNum"`
		Albums int    `json:"albumNum"`
	}{id, 20, 20})
	var result struct {
		Detail struct {
			Info struct {
				Title   string `json:"artistName"`
				Picture struct {
					Big    string `json:"bigImgURL"`
					Middle string `json:"middleImgURL"`
					Small  string `json:"smallImgURL"`
				} `json:"picture"`
			} `json:"artistInfo"`
			Items  []json.RawMessage `json:"songSimpleInfos"`
			Albums []struct {
				ID    string `json:"albumCode"`
				Title string `json:"albumName"`
			} `json:"albumSimpleInfos"`
		} `json:"artistInfoEx"`
	}
	err := c.post(ctx, MusicEndpoint+"/music-metacontent-service/v2/service/artist/detail/byartistcode", "artist", "application/json", body, headers, &result, true)
	if err != nil {
		return Detail{}, err
	}
	cover := ""
	for _, candidate := range []string{result.Detail.Info.Picture.Big, result.Detail.Info.Picture.Middle, result.Detail.Info.Picture.Small} {
		if SafeResourceURL(candidate) {
			cover = candidate
			break
		}
	}
	d := Detail{CoverURL: cover, ID: id, Title: result.Detail.Info.Title, Tracks: pageFrom(result.Detail.Items, 0, 0).Tracks}
	for _, a := range result.Detail.Albums {
		if a.ID != "" && a.Title != "" {
			d.Albums = append(d.Albums, Album{ID: a.ID, Title: a.Title})
		}
	}
	return d, nil
}
