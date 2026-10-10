# Security

## What these tools do to your machine

- `gs-demo` copies the folder you give it to a temporary folder, reads the copy and deletes it. It runs no code of your project. It leaves out dependency folders, symbolic links and files that look like secrets (`.env`, keys, certificates) when copying.
- `gs-check` clones the committed state of a repository into a temporary folder and **executes the project's code there** (install scripts, hooks, tests) to see whether its gates really refuse a bad change. By default it now does that inside a throwaway Docker container (no network, read-only copy, non-root, resource limits, no host environment) and refuses to run on the host without `--run-on-host --i-trust-this-repo` and a typed confirmation; see `tools/gs-check/README.md`, "Trust and isolation". A container is not a virtual machine: for hostile code use a throwaway VM.
- `gs-lock`, `gs-decide`, `gs-snapshot` and `gs-init` read and write files in the project you point them at, and run `git`. `gs-init` writes files; start with `--dry-run`.
- No tool uses the network or a model. None sends anything anywhere.

## Reporting a problem

If you find a security problem (for example a way for a project under inspection to make a tool write outside its temporary folder), please report it privately through GitHub's "Report a vulnerability" button on the Security tab of this repository. If that is not available, open an issue that says only that you have a security report, without the details, and a maintainer will arrange a private channel.

This is a small project maintained by one person. Expect an answer within a few days, not hours. There is no bug bounty.

## Supported versions

Only the latest commit on `main`.
