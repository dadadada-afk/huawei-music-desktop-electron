// capability-probe is an offline rendering experiment, not the music client.
package main

import (
	"log"

	"github.com/vivaui/viva/app"
	"github.com/vivaui/viva/components"
	"github.com/vivaui/viva/ui"
)

var (
	tree      = ui.Tree{}
	page      = tree.Feature("migration")
	detailsID = tree.ID(page, "details")
)

type model struct{ details bool }

func rgb(r, g, b uint8, alpha float32) ui.Color {
	return ui.Color{Red: float32(r) / 255, Green: float32(g) / 255, Blue: float32(b) / 255, Alpha: alpha}
}

func panel(c *ui.Canvas, bounds ui.Rect, alpha float32) {
	c.Shadow(bounds, 20.02, ui.ShadowStyle{OffsetY: 1, Blur: 2}, rgb(16, 18, 22, .04))
	c.Shadow(bounds, 20.02, ui.ShadowStyle{OffsetY: 14, Blur: 40}, rgb(16, 18, 22, .07))
	c.RoundedBorder(bounds, 20.02, 1, rgb(255, 255, 255, .6), rgb(255, 255, 255, alpha))
}

func config(m *model) app.Config {
	return app.Config{
		Title: "Viva migration capability probe (offline)", Tree: &tree,
		Width: 1180, Height: 760,
		Paint: func(c *ui.Canvas, size ui.Size) {
			ink, muted := rgb(22, 24, 28, 1), rgb(92, 97, 105, 1)
			c.Fill(ui.Rect{Width: size.Width, Height: size.Height}, rgb(241, 240, 237, 1))
			rail := float32(234)
			if size.Width <= 1100 {
				rail = 200
			}
			if size.Width <= 1020 {
				rail = 76
			}
			panel(c, ui.Rect{X: 10, Y: 10, Width: rail, Height: size.Height - 110}, .66)
			x := rail + 20
			panel(c, ui.Rect{X: x, Y: 10, Width: size.Width - x - 10, Height: size.Height - 110}, .44)
			panel(c, ui.Rect{X: 10, Y: size.Height - 90, Width: size.Width - 20, Height: 80}, .82)
			c.Rounded(ui.Rect{X: 32, Y: 32, Width: 36, Height: 36}, 12, rgb(200, 32, 46, 1))
			if rail > 76 {
				c.Label("Viva / M0", ui.Rect{X: 78, Y: 40, Width: 150, Height: 24}, ui.TextStyle{Size: 15, Weight: 650, Color: ink})
			}
			text := func(value string, y, fontSize float32, color ui.Color) {
				c.Label(value, ui.Rect{X: x + 30, Y: y, Width: size.Width - x - 70, Height: 32}, ui.TextStyle{Size: fontSize, Color: color})
			}
			text("迁移能力检查 · 离线", 44, 26, ink)
			text("仅验证 Viva 原生绘制基础；不是已迁移的音乐客户端。", 94, 13, muted)
			text("已接入：面板几何、透明色、圆角、阴影、中文标签。", 148, 15, ink)
			text("待解决：官方内嵌登录、MP3/FLAC 播放。", 194, 15, ink)
			text("待补齐：背景模糊、任意字体、完整页面与截图对比。", 240, 15, ink)
			button := components.BeginButton(c, ui.LightTheme(), detailsID, ui.Rect{X: x + 30, Y: 304, Width: 180, Height: 36})
			if button.Outline("查看验收边界").Clicked() {
				m.details = !m.details
			}
			if m.details {
				text("没有读取私人会话，也没有发起华为业务请求。", 370, 13, muted)
				text("构建和离线测试不代表登录、音频或像素级复刻通过。", 406, 13, muted)
			}
			c.Label("M1 pending · 未启用登录 / 播放", ui.Rect{X: 30, Y: size.Height - 62, Width: size.Width - 60, Height: 24}, ui.TextStyle{Size: 13, Color: muted})
		},
	}
}

func main() {
	var canvas ui.Canvas
	if err := app.RunCanvas(config(&model{}), &canvas); err != nil {
		log.Fatal(err)
	}
}
