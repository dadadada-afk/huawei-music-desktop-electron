//go:build (!darwin && !linux && !windows) || (darwin && !cgo)

package media

type Event struct {
	Command  int
	Position float64
}
type Controller struct{}

func New(func(Event)) *Controller                                 { return nil }
func (*Controller) Update(string, string, float64, float64, bool) {}
func (*Controller) Close()                                        {}

func (c *Controller) Preferences(float64, bool, string) {}
