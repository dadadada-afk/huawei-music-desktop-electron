package huawei

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"time"
)

func (s *Session) AccountKey() string {
	if s == nil {
		return ""
	}
	sum := sha256.Sum256([]byte(s.snsUserID))
	return hex.EncodeToString(sum[:])
}
func NewVaultKey() []byte { key := make([]byte, 32); rand.Read(key); return key }
func SealSession(s *Session, key []byte) ([]byte, error) {
	if s == nil || s.token == "" || s.snsUserID == "" {
		return nil, errors.New("invalid session")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, errors.New("invalid vault key")
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	data, _ := json.Marshal(struct{ Token, User, Expiry string }{s.token, s.snsUserID, s.expireTime})
	nonce := make([]byte, aead.NonceSize())
	rand.Read(nonce)
	return aead.Seal(nonce, nonce, data, []byte("hwmusic-viva-session-v1")), nil
}
func OpenSession(blob, key []byte) (*Session, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, errors.New("invalid vault key")
	}
	aead, err := cipher.NewGCM(block)
	if err != nil || len(blob) < aead.NonceSize() || len(blob) > 64*1024 {
		return nil, errors.New("invalid encrypted session")
	}
	data, err := aead.Open(nil, blob[:aead.NonceSize()], blob[aead.NonceSize():], []byte("hwmusic-viva-session-v1"))
	if err != nil {
		return nil, errors.New("session could not be decrypted")
	}
	var doc struct{ Token, User, Expiry string }
	if json.Unmarshal(data, &doc) != nil || doc.Token == "" || doc.User == "" {
		return nil, errors.New("invalid session document")
	}
	if _, err := musicHeaders(doc.Token, time.Now()); err != nil {
		return nil, err
	}
	return &Session{token: doc.Token, snsUserID: doc.User, expireTime: doc.Expiry}, nil
}
