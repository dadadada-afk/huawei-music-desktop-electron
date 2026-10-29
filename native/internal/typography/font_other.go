//go:build (!darwin && !linux && !windows) || (darwin && !cgo)

package typography

import "github.com/vivaui/viva/ui"

func DefaultFamily() string { return "" }

func Families() []string                                                    { return nil }
func Render(string, string, float32, float32, int, int, ui.Color) ui.Bitmap { return ui.Bitmap{} }
