package lyrics

import (
	"reflect"
	"testing"
)

func TestTimestampsTranslationWordsAndOffset(t *testing.T) {
	lines := Parse("[ti:metadata]\n[offset:500]\n[00:01.00]<00:01.00>Hello <00:01.50>world\n[00:01.00]你好\n[00:03][00:04]Again")
	if len(lines) != 3 || lines[0].Time != 1.5 || lines[0].Text != "Hello world" || lines[0].Translation != "你好" || len(lines[0].Words) != 2 || lines[0].Words[1].Time != 2 {
		t.Fatalf("unexpected lyrics: %+v", lines)
	}
	if Active(lines, 1) != -1 || Active(lines, 3.5) != 1 {
		t.Fatal("incorrect active line")
	}
}
func TestPlainTextDoesNotInventTiming(t *testing.T) {
	lines := Parse("[ar:Artist]\nplain line\nsecond line")
	if len(lines) != 2 || lines[0].Time != -1 || Active(lines, 100) != -1 {
		t.Fatal("plain text became synchronized")
	}
}

func TestInlineRomanization(t *testing.T) {
	lines := Parse("[00:01][00:03]梦里归家那一扇灯^mong lui guai ga na ya sin dang\n[00:01]The light back home\n[00:04]<00:04>心中<00:05>所属唯独你^san zong so su wai du nei\n无时间歌词^wu shi jian ge ci")
	if len(lines) != 4 || lines[0].Time != -1 || lines[0].Romanization != "wu shi jian ge ci" {
		t.Fatalf("plain or repeated timestamps lost: %+v", lines)
	}
	for _, line := range lines[1:3] {
		if line.Text != "梦里归家那一扇灯" || line.Romanization != "mong lui guai ga na ya sin dang" {
			t.Fatalf("inline pronunciation not separated: %+v", line)
		}
	}
	if !reflect.DeepEqual(lines[1].Subtitles(), []string{"mong lui guai ga na ya sin dang", "The light back home"}) {
		t.Fatal("pronunciation and translation must both be kept")
	}
	line := lines[3]
	if line.Text != "心中所属唯独你" || len(line.Words) != 2 || line.Words[1].Text != "所属唯独你" || line.Words[1].Time != 5 {
		t.Fatalf("pronunciation contaminated karaoke words: %+v", line)
	}
	for _, text := range []string{"x^2", "Hello^world", "歌词^", "^roman", "歌词^123"} {
		line := Parse("[00:01]" + text)[0]
		if line.Text != text || line.Romanization != "" {
			t.Fatalf("literal caret changed: %+v", line)
		}
	}
}

func TestInlineTranslationAndCombinedSubtitles(t *testing.T) {
	for _, pair := range [][2]string{
		{"Sing", "唱吧"},
		{"Dap-dadada-dadpm-didap-da", "哒啦哒啦哒啦哒"},
		{"I'm sittin' here I missed the power", "坐在这儿 浑身无力"},
		{"歌词", "另一句"},
	} {
		line := Parse("[00:01]" + pair[0] + "^" + pair[1])[0]
		if line.Text != pair[0] || line.Translation != pair[1] || line.Romanization != "" {
			t.Fatalf("inline translation not split: %+v", line)
		}
	}
	lines := Parse("[00:01][00:03]<00:01>Sing^<00:01>唱吧\n[00:01]唱吧\n[00:05]君の声^kimi no koe^你的声音\nHello^你好")
	if len(lines) != 4 || lines[0].Time != -1 || lines[0].Translation != "你好" {
		t.Fatalf("plain text subtitle lost: %+v", lines)
	}
	if lines[1].Translation != "唱吧" || len(lines[1].Words) != 1 || lines[1].Words[0].Text != "Sing" || lines[2].Translation != "唱吧" {
		t.Fatal("duplicate translation or word timing changed", lines)
	}
	if !reflect.DeepEqual(lines[3].Subtitles(), []string{"kimi no koe", "你的声音"}) {
		t.Fatal("combined subtitles lost", lines[3])
	}
}
