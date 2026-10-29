package lyrics

import (
	"bytes"
	"errors"
	"unicode/utf16"
	"unicode/utf8"

	"golang.org/x/text/encoding/simplifiedchinese"
)

func Decode(data []byte) (string, error) {
	if len(data) > 512*1024 {
		return "", errors.New("lyrics too large")
	}
	if len(data) >= 2 && ((data[0] == 0xff && data[1] == 0xfe) || (data[0] == 0xfe && data[1] == 0xff)) {
		if len(data)%2 != 0 {
			return "", errors.New("truncated UTF-16")
		}
		words := make([]uint16, 0, len(data)/2)
		for i := 2; i < len(data); i += 2 {
			v := uint16(data[i]) | uint16(data[i+1])<<8
			if data[0] == 0xfe {
				v = uint16(data[i])<<8 | uint16(data[i+1])
			}
			words = append(words, v)
		}
		return string(utf16.Decode(words)), nil
	}
	if utf8.Valid(data) {
		return string(bytes.TrimPrefix(data, []byte{0xef, 0xbb, 0xbf})), nil
	}
	decoded, err := simplifiedchinese.GBK.NewDecoder().Bytes(data)
	if err != nil || bytes.Contains(decoded, []byte("\ufffd")) {
		return "", errors.New("invalid lyric encoding")
	}
	return string(decoded), nil
}
