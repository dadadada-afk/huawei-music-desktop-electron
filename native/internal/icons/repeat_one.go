package icons

import "github.com/vivaui/viva/ui"

// RepeatOne reuses the Lucide repeat outline and adds a centered numeral.
var RepeatOne = func() ui.Icon {
	icon := Repeat
	icon.Commands = append(append([]ui.PathCommand(nil), Repeat.Commands...), ui.MoveTo(10, 10), ui.LineTo(12, 8), ui.LineTo(12, 16))
	return icon
}()
