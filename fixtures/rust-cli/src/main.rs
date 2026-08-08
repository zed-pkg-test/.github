use std::process::ExitCode;

const HELP: &str = "portable-rust-cli 0.1.0\n\nUsage: portable-rust-cli [--help]\n";

fn run<I>(arguments: I) -> Result<&'static str, &'static str>
where
    I: IntoIterator,
    I::Item: AsRef<str>,
{
    let mut arguments = arguments.into_iter();
    match arguments.next() {
        None => Ok(HELP),
        Some(argument) if matches!(argument.as_ref(), "--help" | "-h") => Ok(HELP),
        Some(_) => Err("unsupported argument; use --help"),
    }
}

fn main() -> ExitCode {
    match run(std::env::args().skip(1)) {
        Ok(output) => {
            print!("{output}");
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("{error}");
            ExitCode::from(2)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{run, HELP};

    #[test]
    fn help_is_available_with_short_and_long_flags() {
        assert_eq!(run(["--help"]), Ok(HELP));
        assert_eq!(run(["-h"]), Ok(HELP));
    }

    #[test]
    fn unknown_arguments_fail_closed() {
        assert!(run(["--publish"]).is_err());
    }
}
