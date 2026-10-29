package visual

import (
	"encoding/binary"
	"fmt"
	"github.com/vivaui/viva/ui"
	"hash/fnv"
	"math"
	"sort"
)

// Backdrop samples already-declared native primitives at quarter resolution.
// Its input excludes the overlay itself; text is included via our font bitmaps.
func Backdrop(c *ui.Canvas, b ui.Rect, blur, radius, opacity float32) (ui.Bitmap, uint64) {
	const scale = float32(.25)
	margin := blur * 2
	region := ui.Rect{X: b.X - margin, Y: b.Y - margin, Width: b.Width + margin*2, Height: b.Height + margin*2}
	w, h := max(1, int(math.Ceil(float64(region.Width*scale)))), max(1, int(math.Ceil(float64(region.Height*scale))))
	pix := make([]byte, w*h*4)
	hash := fnv.New64a()
	write := func(v float32) {
		var data [4]byte
		binary.LittleEndian.PutUint32(data[:], math.Float32bits(v))
		hash.Write(data[:])
	}
	for _, v := range []float32{b.X, b.Y, b.Width, b.Height, blur, radius, opacity} {
		write(v)
	}
	inside := func(x, y float32, r ui.Rect) bool { return x >= r.X && y >= r.Y && x < r.X+r.Width && y < r.Y+r.Height }
	blend := func(at int, r, g, blue, a float32) {
		a = max(0, min(1, a))
		for i, v := range []float32{blue, g, r} {
			pix[at+i] = byte(max(0, min(255, v*255+float32(pix[at+i])*(1-a))))
		}
		pix[at+3] = byte(a*255 + float32(pix[at+3])*(1-a))
	}
	raster := func(bounds, clip ui.Rect, clipped bool, sample func(float32, float32) (float32, float32, float32, float32)) {
		x0 := max(0, int((bounds.X-region.X)*scale))
		y0 := max(0, int((bounds.Y-region.Y)*scale))
		x1 := min(w, int(math.Ceil(float64((bounds.X+bounds.Width-region.X)*scale))))
		y1 := min(h, int(math.Ceil(float64((bounds.Y+bounds.Height-region.Y)*scale))))
		for y := y0; y < y1; y++ {
			for x := x0; x < x1; x++ {
				px, py := region.X+(float32(x)+.5)/scale, region.Y+(float32(y)+.5)/scale
				if clipped && !inside(px, py, clip) {
					continue
				}
				r, g, b, a := sample(px, py)
				blend((y*w+x)*4, r, g, b, a)
			}
		}
	}
	drawImage := func(im ui.Image) {
		if im.Bitmap.Width == 0 || im.Bounds.Width <= 0 || im.Bounds.Height <= 0 {
			return
		}
		write(float32(im.Bitmap.ID))
		write(float32(im.Bitmap.Version))
		for _, v := range []float32{im.Bounds.X, im.Bounds.Y, im.Bounds.Width, im.Bounds.Height} {
			write(v)
		}
		raster(im.Bounds, im.ClipOf, im.HasClip, func(x, y float32) (float32, float32, float32, float32) {
			sx := max(0, min(im.Bitmap.Width-1, int(im.Source.X+(x-im.Bounds.X)/im.Bounds.Width*im.Source.Width)))
			sy := max(0, min(im.Bitmap.Height-1, int(im.Source.Y+(y-im.Bounds.Y)/im.Bounds.Height*im.Source.Height)))
			at := sy*im.Bitmap.Stride + sx*4
			p := im.Bitmap.Pix
			return float32(p[at+2]) / 255, float32(p[at+1]) / 255, float32(p[at]) / 255, float32(p[at+3]) / 255
		})
	}
	drawRect := func(r ui.Rectangle) {
		for _, v := range []float32{r.Bounds.X, r.Bounds.Y, r.Bounds.Width, r.Bounds.Height, r.Color.Red, r.Color.Green, r.Color.Blue, r.Color.Alpha, r.Radius} {
			write(v)
		}
		raster(r.Bounds, r.ClipOf, r.HasClip, func(x, y float32) (float32, float32, float32, float32) {
			dx := max(0, r.Bounds.X+r.Radius-x, x-r.Bounds.X-r.Bounds.Width+r.Radius)
			dy := max(0, r.Bounds.Y+r.Radius-y, y-r.Bounds.Y-r.Bounds.Height+r.Radius)
			if dx*dx+dy*dy > r.Radius*r.Radius {
				return 0, 0, 0, 0
			}
			a := r.Color.Alpha
			return r.Color.Red * a, r.Color.Green * a, r.Color.Blue * a, a
		})
	}
	drawTriangle := func(t ui.Triangle) {
		a, bb, cc := t.Points[0], t.Points[1], t.Points[2]
		d := (bb.Y-cc.Y)*(a.X-cc.X) + (cc.X-bb.X)*(a.Y-cc.Y)
		if d == 0 {
			return
		}
		x, y := min(a.X, bb.X, cc.X), min(a.Y, bb.Y, cc.Y)
		raster(ui.Rect{X: x, Y: y, Width: max(a.X, bb.X, cc.X) - x, Height: max(a.Y, bb.Y, cc.Y) - y}, t.ClipOf, t.HasClip, func(x, y float32) (float32, float32, float32, float32) {
			u := ((bb.Y-cc.Y)*(x-cc.X) + (cc.X-bb.X)*(y-cc.Y)) / d
			v := ((cc.Y-a.Y)*(x-cc.X) + (a.X-cc.X)*(y-cc.Y)) / d
			if u < 0 || v < 0 || u+v > 1 {
				return 0, 0, 0, 0
			}
			tint := t.Color
			if t.Shaded {
				tint = ui.Color{Red: u*t.Color.Red + v*t.Shade[0].Red + (1-u-v)*t.Shade[1].Red, Green: u*t.Color.Green + v*t.Shade[0].Green + (1-u-v)*t.Shade[1].Green, Blue: u*t.Color.Blue + v*t.Shade[0].Blue + (1-u-v)*t.Shade[1].Blue, Alpha: u*t.Color.Alpha + v*t.Shade[0].Alpha + (1-u-v)*t.Shade[1].Alpha}
			}
			return tint.Red * tint.Alpha, tint.Green * tint.Alpha, tint.Blue * tint.Alpha, tint.Alpha
		})
	}
	drawShadow := func(s ui.Shadow) {
		extent := s.Style.Extent()
		bounds := ui.Rect{X: s.Bounds.X - extent, Y: s.Bounds.Y - extent, Width: s.Bounds.Width + 2*extent, Height: s.Bounds.Height + 2*extent}
		raster(bounds, s.ClipOf, s.HasClip, func(x, y float32) (float32, float32, float32, float32) {
			distance := func(x, y float32, b ui.Rect, r float32) float32 {
				qx := float32(math.Abs(float64(x-b.X-b.Width/2))) - b.Width/2 + r
				qy := float32(math.Abs(float64(y-b.Y-b.Height/2))) - b.Height/2 + r
				return float32(math.Hypot(float64(max(qx, 0)), float64(max(qy, 0)))) + min(max(qx, qy), 0) - r
			}
			if distance(x, y, s.Bounds, s.Radius) < 0 {
				return 0, 0, 0, 0
			}
			cast := ui.Rect{X: s.Bounds.X + s.Style.OffsetX - s.Style.Spread, Y: s.Bounds.Y + s.Style.OffsetY - s.Style.Spread, Width: s.Bounds.Width + 2*s.Style.Spread, Height: s.Bounds.Height + 2*s.Style.Spread}
			d := distance(x, y, cast, max(0, s.Radius+s.Style.Spread))
			alpha := s.Color.Alpha * float32(.5*math.Erfc(float64(d)/float64(max(1, s.Style.Blur*.5))))
			return s.Color.Red * alpha, s.Color.Green * alpha, s.Color.Blue * alpha, alpha
		})
	}
	// Match the compositor: backdrop plane, then each layer's interleaved
	// geometry, followed by its bitmaps (including application-rendered text).
	layers := map[uint16]bool{}
	for _, im := range c.Images() {
		if im.Backdrop {
			drawImage(im)
		} else {
			layers[im.Layer] = true
		}
	}
	for _, r := range c.Rectangles() {
		layers[r.Layer] = true
	}
	for _, t := range c.Triangles() {
		layers[t.Layer] = true
	}
	for _, s := range c.Shadows() {
		layers[s.Layer] = true
	}
	ordered := make([]int, 0, len(layers))
	for layer := range layers {
		ordered = append(ordered, int(layer))
	}
	sort.Ints(ordered)
	for _, layer := range ordered {
		ti, si := 0, 0
		for ri := 0; ri <= len(c.Rectangles()); ri++ {
			for {
				triangleDue := ti < len(c.Triangles()) && int(c.Triangles()[ti].RectsBefore) <= ri
				shadowDue := si < len(c.Shadows()) && int(c.Shadows()[si].RectsBefore) <= ri
				if shadowDue && (!triangleDue || int(c.Shadows()[si].TrianglesBefore) <= ti) {
					s := c.Shadows()[si]
					if int(s.Layer) == layer {
						drawShadow(s)
					}
					si++
				} else if triangleDue {
					t := c.Triangles()[ti]
					if int(t.Layer) == layer {
						drawTriangle(t)
					}
					ti++
				} else {
					break
				}
			}
			if ri < len(c.Rectangles()) {
				r := c.Rectangles()[ri]
				if int(r.Layer) == layer {
					drawRect(r)
				}
			}
		}
		for _, im := range c.Images() {
			if !im.Backdrop && int(im.Layer) == layer {
				drawImage(im)
			}
		}
	}
	image := Blur(ui.Bitmap{Pix: pix, Width: w, Height: h, Stride: w * 4}, max(1, int(blur*scale*.58)), 1.3, 1)
	cw, ch := max(1, int(b.Width*scale)), max(1, int(b.Height*scale))
	crop := make([]byte, cw*ch*4)
	ox, oy := int(margin*scale), int(margin*scale)
	for y := 0; y < ch; y++ {
		for x := 0; x < cw; x++ {
			source := (min(h-1, y+oy)*w + min(w-1, x+ox)) * 4
			at := (y*cw + x) * 4
			for channel := 0; channel < 3; channel++ {
				crop[at+channel] = byte(float32(image.Pix[source+channel])*(1-opacity) + 255*opacity)
			}
			crop[at+3] = 255
		}
	}
	result := Round(ui.Bitmap{Pix: crop, Width: cw, Height: ch, Stride: cw * 4, Version: 1}, float64(radius*scale))
	return result, hash.Sum64()
}

func BackdropKey(c *ui.Canvas, b ui.Rect, radius, opacity float32) uint64 {
	h := fnv.New64a()
	fmt.Fprintf(h, "%v/%g/%g", b, radius, opacity)
	// Include clips, paint ordering, shading and exact bitmap identities. Pixel
	// buffers are immutable for an ID/version and must not be rehashed per frame.
	for _, r := range c.Rectangles() {
		fmt.Fprintf(h, "%v", r)
	}
	for _, t := range c.Triangles() {
		fmt.Fprintf(h, "%v", t)
	}
	for _, s := range c.Shadows() {
		fmt.Fprintf(h, "%v", s)
	}
	for _, im := range c.Images() {
		fmt.Fprintf(h, "%v/%v/%v/%v/%v/%v/%d/%d", im.Bounds, im.Source, im.Layer, im.Backdrop, im.ClipOf, im.HasClip, im.Bitmap.ID, im.Bitmap.Version)
	}
	return h.Sum64()
}
