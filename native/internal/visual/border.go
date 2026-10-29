package visual

import "github.com/vivaui/viva/ui"

// CSS borders are rings. Canvas.RoundedBorder paints an entire backing rect,
// which makes translucent fills too opaque and darkens transparent selections.
func Border(c *ui.Canvas, b ui.Rect, r, width float32, edge, fill ui.Color) {
	if b.Width <= 0 || b.Height <= 0 {
		return
	}
	c.Rounded(b, r, fill)
	inset := width / 2
	w, h := b.Width-width, b.Height-width
	if w <= 0 || h <= 0 {
		return
	}
	radius := max(0, min(r-inset, w/2, h/2))
	p := ui.NewPath(w, h, ui.MoveTo(radius, 0), ui.LineTo(w-radius, 0), ui.QuadTo(w, 0, w, radius), ui.LineTo(w, h-radius), ui.QuadTo(w, h, w-radius, h), ui.LineTo(radius, h), ui.QuadTo(0, h, 0, h-radius), ui.LineTo(0, radius), ui.QuadTo(0, 0, radius, 0), ui.ClosePath())
	c.DrawPath(p, ui.Rect{X: b.X + inset, Y: b.Y + inset, Width: w, Height: h}, ui.PathStyle{Stroke: edge, StrokeWidth: width})
}
