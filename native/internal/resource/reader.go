package resource

import (
	"context"
	"errors"
	"io"
)

// Reader is a bounded seekable CDN reader. Decoders see at most one cached
// range and never receive credentials or a URL they could fetch themselves.
type Reader struct {
	ctx                   context.Context
	cancel                context.CancelFunc
	client                *Client
	url                   string
	position, total, base int64
	chunk                 []byte
}

func OpenReader(ctx context.Context, raw string) (*Reader, error) {
	client := New()
	probe, err := client.Range(ctx, raw, 0, 512)
	if err != nil {
		return nil, err
	}
	stream, cancel := context.WithCancel(context.Background())
	return &Reader{ctx: stream, cancel: cancel, client: client, url: raw, total: probe.Total, chunk: probe.Bytes}, nil
}
func (r *Reader) Read(p []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	if len(p) == 0 {
		return 0, nil
	}
	if r.position >= r.total {
		return 0, io.EOF
	}
	if r.position < r.base || r.position >= r.base+int64(len(r.chunk)) {
		chunk, err := r.client.Range(r.ctx, r.url, r.position, int(min(256*1024, r.total-r.position)))
		if err != nil {
			return 0, err
		}
		if chunk.Total != r.total {
			return 0, errors.New("audio size changed")
		}
		r.base = r.position
		r.chunk = chunk.Bytes
	}
	n := copy(p, r.chunk[r.position-r.base:])
	r.position += int64(n)
	return n, nil
}
func (r *Reader) Seek(offset int64, whence int) (int64, error) {
	next := offset
	switch whence {
	case io.SeekStart:
	case io.SeekCurrent:
		next += r.position
	case io.SeekEnd:
		next += r.total
	default:
		return 0, errors.New("invalid seek origin")
	}
	if next < 0 || next > r.total {
		return 0, errors.New("audio seek outside resource")
	}
	r.position = next
	return next, nil
}
func (r *Reader) Close() error { r.cancel(); return nil }
