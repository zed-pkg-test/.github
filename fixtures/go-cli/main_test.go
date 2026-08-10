package main

import "testing"

func TestHelpIsAvailableWithShortAndLongFlags(t *testing.T) {
	for _, argument := range []string{"--help", "-h"} {
		code, output := run([]string{argument})
		if code != 0 {
			t.Fatalf("%s returned code %d", argument, code)
		}
		if output != help {
			t.Fatalf("%s output = %q, want %q", argument, output, help)
		}
	}
}

func TestUnknownArgumentsFailClosed(t *testing.T) {
	code, _ := run([]string{"--publish"})
	if code != 2 {
		t.Fatalf("unknown argument returned code %d, want 2", code)
	}
}
