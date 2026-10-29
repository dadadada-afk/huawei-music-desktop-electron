package lyrics

import "testing"

func TestCandidateRejectsDifferentRecording(t *testing.T) {
	q := Query{Title: "安静", Artist: "测试歌手", Duration: 200}
	for _, c := range []Candidate{{Title: "安静", Artist: "另一歌手", Duration: 200}, {Title: "安静下来", Artist: "测试歌手", Duration: 240}} {
		if pick([]Candidate{c}, q) != nil {
			t.Fatal("wrong lyric match")
		}
	}
	if pick([]Candidate{{Title: "安静 (Live)", Artist: "测试歌手", Duration: 202}}, q) == nil {
		t.Fatal("normalized matching song rejected")
	}
}
func TestDecodeLocalLyricEncodings(t *testing.T) {
	for _, data := range [][]byte{[]byte("中文"), {0xd6, 0xd0, 0xce, 0xc4}, {0xff, 0xfe, 0x2d, 0x4e, 0x87, 0x65}, {0xfe, 0xff, 0x4e, 0x2d, 0x65, 0x87}} {
		text, err := Decode(data)
		if err != nil || text != "中文" {
			t.Fatal("encoding mismatch")
		}
	}
	if _, err := Decode([]byte{0xff, 0xfe, 0x01}); err == nil {
		t.Fatal("truncated utf16 accepted")
	}
}
