package main

import (
	"fmt"
	"os"
)

const help = "portable-go-cli 0.1.0\n\nUsage: portable-go-cli [--help]\n"

func run(arguments []string) (int, string) {
	if len(arguments) == 0 || arguments[0] == "--help" || arguments[0] == "-h" {
		return 0, help
	}
	return 2, "unsupported argument; use --help\n"
}

func main() {
	code, output := run(os.Args[1:])
	if code == 0 {
		fmt.Print(output)
	} else {
		fmt.Fprint(os.Stderr, output)
	}
	os.Exit(code)
}
