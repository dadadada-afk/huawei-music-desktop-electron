package visual

import "github.com/vivaui/viva/ui"

func RoundedGradient(c *ui.Canvas, b ui.Rect, r float32, from, to ui.Color) {
	r = min(r, b.Width/2, b.Height/2)
	p := ui.NewPath(b.Width, b.Height, ui.MoveTo(r, 0), ui.LineTo(b.Width-r, 0), ui.QuadTo(b.Width, 0, b.Width, r), ui.LineTo(b.Width, b.Height-r), ui.QuadTo(b.Width, b.Height, b.Width-r, b.Height), ui.LineTo(r, b.Height), ui.QuadTo(0, b.Height, 0, b.Height-r), ui.LineTo(0, r), ui.QuadTo(0, 0, r, 0), ui.ClosePath())
	c.DrawPath(p, b, ui.PathStyle{FillGradient: &ui.LinearGradient{Start: ui.Point{}, End: ui.Point{X: b.Width * .5, Y: b.Height}, From: from, To: to}})
}
