package icons

import "github.com/vivaui/viva/ui"

// Compact solid transport shapes balance the rounded outline navigation set.
var PlayerPause = ui.Icon{ViewBox: 24, Commands: []ui.PathCommand{
	ui.MoveTo(7, 4), ui.CubicTo(5.9, 4, 5, 4.9, 5, 6), ui.LineTo(5, 18), ui.CubicTo(5, 20.7, 9, 20.7, 9, 18), ui.LineTo(9, 6), ui.CubicTo(9, 4.9, 8.1, 4, 7, 4), ui.ClosePath(),
	ui.MoveTo(17, 4), ui.CubicTo(15.9, 4, 15, 4.9, 15, 6), ui.LineTo(15, 18), ui.CubicTo(15, 20.7, 19, 20.7, 19, 18), ui.LineTo(19, 6), ui.CubicTo(19, 4.9, 18.1, 4, 17, 4), ui.ClosePath(),
}}
var PlayerNext = ui.Icon{ViewBox: 24, Commands: []ui.PathCommand{
	ui.MoveTo(5, 5), ui.CubicTo(4, 4.4, 3, 5, 3, 6.2), ui.LineTo(3, 17.8), ui.CubicTo(3, 19, 4, 19.6, 5, 19), ui.LineTo(14, 13.1), ui.CubicTo(15, 12.5, 15, 11.5, 14, 10.9), ui.ClosePath(),
	ui.MoveTo(18, 5), ui.CubicTo(17, 5, 16.5, 5.5, 16.5, 6.5), ui.LineTo(16.5, 17.5), ui.CubicTo(16.5, 19.5, 20, 19.5, 20, 17.5), ui.LineTo(20, 6.5), ui.CubicTo(20, 5.5, 19, 5, 18, 5), ui.ClosePath(),
}}
var PlayerPrevious = ui.Icon{ViewBox: 24, Commands: []ui.PathCommand{
	ui.MoveTo(19, 5), ui.CubicTo(20, 4.4, 21, 5, 21, 6.2), ui.LineTo(21, 17.8), ui.CubicTo(21, 19, 20, 19.6, 19, 19), ui.LineTo(10, 13.1), ui.CubicTo(9, 12.5, 9, 11.5, 10, 10.9), ui.ClosePath(),
	ui.MoveTo(6, 5), ui.CubicTo(7, 5, 7.5, 5.5, 7.5, 6.5), ui.LineTo(7.5, 17.5), ui.CubicTo(7.5, 19.5, 4, 19.5, 4, 17.5), ui.LineTo(4, 6.5), ui.CubicTo(4, 5.5, 5, 5, 6, 5), ui.ClosePath(),
}}
var Ordered = ui.Icon{ViewBox: 24, Stroke: 2, Cap: ui.CapRound, Join: ui.JoinRound, Commands: []ui.PathCommand{
	ui.MoveTo(4, 6), ui.LineTo(18, 6), ui.MoveTo(4, 12), ui.LineTo(18, 12), ui.MoveTo(4, 18), ui.LineTo(12, 18), ui.MoveTo(16, 15), ui.LineTo(20, 18), ui.LineTo(16, 21),
}}

func RoundedStroke(icon ui.Icon) ui.Icon {
	if icon.Stroke > 0 {
		icon.Stroke = 2
	}
	icon.Cap = ui.CapRound
	icon.Join = ui.JoinRound
	return icon
}
