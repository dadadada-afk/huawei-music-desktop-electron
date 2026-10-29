// Development-only SVG compiler; never imported into the client.
package main

import (
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/vivaui/viva/tools/iconcompile"
	"github.com/vivaui/viva/ui"
)

func main() {
	if len(os.Args) != 3 {
		log.Fatal("usage: icons svg-directory output.go")
	}
	files, err := filepath.Glob(filepath.Join(os.Args[1], "*.svg"))
	if err != nil {
		log.Fatal(err)
	}
	icons := make(map[string]ui.Icon)
	for _, file := range files {
		data, err := os.ReadFile(file)
		if err != nil {
			log.Fatal(err)
		}
		name := strings.TrimSuffix(filepath.Base(file), ".svg")
		icon, err := iconcompile.Compile(name, data)
		if err != nil {
			log.Fatal(err)
		}
		if strings.HasSuffix(name, "-filled") {
			icon.Stroke = 0
		}
		icons[name] = icon
	}
	license, err := os.ReadFile("assets/lucide/LICENSE")
	if err != nil {
		log.Fatal(err)
	}
	data, err := iconcompile.Generate("icons", icons, string(license))
	if err != nil {
		log.Fatal(err)
	}
	if err = os.MkdirAll(filepath.Dir(os.Args[2]), 0755); err != nil {
		log.Fatal(err)
	}
	if err = os.WriteFile(os.Args[2], data, 0644); err != nil {
		log.Fatal(err)
	}
}
