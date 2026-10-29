package main

import (
	"context"
	"errors"
	"testing"
	"time"

	"huawei-music-desktop/native/internal/huawei"
)

func TestFailedAndStaleLoginPreserveCurrentSession(t *testing.T) {
	old := &huawei.Session{}
	m := &model{session: old, generation: 2, busy: true}
	m.pending = []completion{{generation: 1, session: &huawei.Session{}}}
	m.wake()
	if m.session != old || !m.busy {
		t.Fatal("stale login changed current state")
	}
	m.pending = []completion{{generation: 2, err: errors.New("synthetic failure")}}
	m.wake()
	if m.session != old || m.busy {
		t.Fatal("failed login cleared current session")
	}
	m.generation++
	m.pending = []completion{{generation: 3, session: &huawei.Session{}}}
	m.wake()
	if m.session == old {
		t.Fatal("validated candidate was not installed")
	}
}

func TestCancelDoesNotExchangeOrReplaceSession(t *testing.T) {
	started := make(chan struct{})
	done := make(chan struct{})
	old := &huawei.Session{}
	m := &model{session: old,
		authorize: func(ctx context.Context, _ *huawei.Attempt) (string, error) {
			close(started)
			<-ctx.Done()
			close(done)
			return "", ctx.Err()
		},
		exchange: func(context.Context, *huawei.Attempt) (*huawei.Session, error) {
			t.Error("exchanged cancelled attempt")
			return nil, errors.New("unexpected exchange")
		},
	}
	m.startLogin()
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("worker did not start")
	}
	m.cancelLogin()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("worker did not cancel")
	}
	if m.session != old || m.busy {
		t.Fatal("cancel damaged current session")
	}
	m.close()
}
