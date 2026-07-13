# [2.11.0](https://github.com/qiuweikangdev/keep-notes/compare/v2.10.0...v2.11.0) (2026-07-13)


### Bug Fixes

* align reminder editor controls ([49ecb25](https://github.com/qiuweikangdev/keep-notes/commit/49ecb255fb312f5e84f9a1c423602be9a77f3e6d))
* align rich editor text widths ([87e94dd](https://github.com/qiuweikangdev/keep-notes/commit/87e94dd3a5091c866f5175d463ac53cef44c5302))
* decouple docked diff panel state ([db69a8f](https://github.com/qiuweikangdev/keep-notes/commit/db69a8f660e4b80910f623e8a9ccd97c210ff54c))
* deduplicate strict mode rich editors ([3bd792c](https://github.com/qiuweikangdev/keep-notes/commit/3bd792c93433a1c556afecf473a2c79b0f888383))
* harden persistent rich session lifecycle ([1b0baf7](https://github.com/qiuweikangdev/keep-notes/commit/1b0baf7526b6c3038989cedf2d93dfe9e4442451))
* harden rich session lifecycle ([473d1c2](https://github.com/qiuweikangdev/keep-notes/commit/473d1c2878df7fc3b99c40acd426daa91b566b14))
* isolate outline navigation by pane ([406f5bc](https://github.com/qiuweikangdev/keep-notes/commit/406f5bc0bcb3de23a1f1ad9d8beffa5bcc349040))
* isolate rich pane selections ([5f4eca5](https://github.com/qiuweikangdev/keep-notes/commit/5f4eca52a35cdd67f5b6b06302463193b197f49a))
* isolate split pane editor interactions ([a512bbd](https://github.com/qiuweikangdev/keep-notes/commit/a512bbd7773cd6515b94d169532b32e63eaf3ca6))
* normalize line endings in diff comparison ([ab9ce77](https://github.com/qiuweikangdev/keep-notes/commit/ab9ce778a3688fa55ce0413aa1c3045bd8d4f840))
* preserve editor instances across panel splits ([6c83307](https://github.com/qiuweikangdev/keep-notes/commit/6c83307a27ed018592589f60fc211cac42503e00))
* preserve file tree scroll position ([b80d3c4](https://github.com/qiuweikangdev/keep-notes/commit/b80d3c48b21c7f9eefb03664b06c6b8c9cbfdbb0))
* preserve nested overlay interactions ([361be71](https://github.com/qiuweikangdev/keep-notes/commit/361be71e0c0eee9e97224cac9e4120c8ce24b733))
* preserve rich pane activation state ([11a6e3f](https://github.com/qiuweikangdev/keep-notes/commit/11a6e3f217697bab65190deddae652821abe0544))
* prevent editor pane flicker during switching ([0be3b08](https://github.com/qiuweikangdev/keep-notes/commit/0be3b080fbcf20e4e5f567c45c7dd5ee402314a0))
* prevent panel resize from capturing scrollbar ([b4b25c8](https://github.com/qiuweikangdev/keep-notes/commit/b4b25c893e77bcb6bf3de493a4c73f402abfc0fc))
* share virtual preview theme observation ([b29a9c4](https://github.com/qiuweikangdev/keep-notes/commit/b29a9c402fa08bf7ae45073eb2545f61e58506af))
* stabilize rich editor pane interactions ([4021e9d](https://github.com/qiuweikangdev/keep-notes/commit/4021e9d990fabbff9c81b96b70521a1643189328))
* stabilize virtual rich preview interactions ([5e60f66](https://github.com/qiuweikangdev/keep-notes/commit/5e60f662eafb70282b32109cdba6fd1a59db5e2e))
* track mark-only rich block changes ([ac6cb00](https://github.com/qiuweikangdev/keep-notes/commit/ac6cb00c678a6364fb3d13e205fba3c0bf30c14f))
* unify rich editor punctuation and list markers ([b478693](https://github.com/qiuweikangdev/keep-notes/commit/b4786930319162bdbdf5b6e342bac217efd2e7b5))


### Features

* activate passive rich panes on first input ([176b35a](https://github.com/qiuweikangdev/keep-notes/commit/176b35a9fd5696a7de26a038046b647dd3844300))
* add rich document pane runtime ([b633b97](https://github.com/qiuweikangdev/keep-notes/commit/b633b973866adb77afa02cbf0f305ffa282ac774))
* cache changed rich preview blocks ([e67aebd](https://github.com/qiuweikangdev/keep-notes/commit/e67aebdf716b123121da804bc964149733f9ad06))
* host one rich editor session per document ([3ffb218](https://github.com/qiuweikangdev/keep-notes/commit/3ffb21852c9a5afc15ceac4f5a129525e1b04e81))
* manage rich document sessions by path ([b22744d](https://github.com/qiuweikangdev/keep-notes/commit/b22744dec0d20c560deb2df4d1c9750f27796404))
* render virtual rich document previews ([da94831](https://github.com/qiuweikangdev/keep-notes/commit/da94831e4d4581be20fa75976df9d217e5400759))
* share rich sessions across split panes ([e159552](https://github.com/qiuweikangdev/keep-notes/commit/e1595526cec2cf4993edc700908dbac53071a3be))
* state performance optimization ([372493e](https://github.com/qiuweikangdev/keep-notes/commit/372493e060fe155786a53ac82cded785e6e3e6e1))
* sync outline with editor scrolling ([79f2a73](https://github.com/qiuweikangdev/keep-notes/commit/79f2a7304a551e570c5dddc1ad08389e5a6ab139))


### Performance Improvements

* bound rich caret position lookup ([aa3cc5e](https://github.com/qiuweikangdev/keep-notes/commit/aa3cc5e65081aa3f60155f67ef30de136684cab6))
* defer large diff computation ([5bcf599](https://github.com/qiuweikangdev/keep-notes/commit/5bcf599388d693f497754917309c1a21e7407131))
* improve large document editor responsiveness ([37375ff](https://github.com/qiuweikangdev/keep-notes/commit/37375ffa475153f3ea058749e5561da8b5f08409))
* keep editor actions responsive ([62b2872](https://github.com/qiuweikangdev/keep-notes/commit/62b2872b7aecdf984c5cb94d1da97882296de24a))
* keep editor visible during file switches ([9cad403](https://github.com/qiuweikangdev/keep-notes/commit/9cad4033992b4979796c8a5b671eb95ba522e675))
* keep large document splits responsive ([f3f0dfa](https://github.com/qiuweikangdev/keep-notes/commit/f3f0dfa94b2387d7c5d4cb20ab022bafdb040e65))
* remove split panel cap and visible sync churn ([4508f5c](https://github.com/qiuweikangdev/keep-notes/commit/4508f5cfaf758abd32b73b070ce02b8f2a1ec9ee))
* stabilize rich panes and virtual previews ([0401b52](https://github.com/qiuweikangdev/keep-notes/commit/0401b526c40f7481a3871555da5658f32a6ab1de))


## Commit Summary

- Compared with: v2.10.0
- Total commits: 41

# [2.10.0](https://github.com/qiuweikangdev/keep-notes/compare/v2.9.3...v2.10.0) (2026-07-12)


### Bug Fixes

* focus code blocks from line gutters ([1396f02](https://github.com/qiuweikangdev/keep-notes/commit/1396f02a5aa0c1165e51b696a8052fce7432e298))
* keep reminder editor open when custom repeat closes ([3e375ae](https://github.com/qiuweikangdev/keep-notes/commit/3e375aee0fbfd45e8fb8e8caff25e7d067fa9147))
* normalize bash code block label ([b84c8f3](https://github.com/qiuweikangdev/keep-notes/commit/b84c8f3234d360181624b96d3506bc3d59e8bd42))
* preserve granular editor undo history ([9dba66f](https://github.com/qiuweikangdev/keep-notes/commit/9dba66f65e170959aa519a7570bff5f95620f2c0))
* recover code block first line ([f7696ef](https://github.com/qiuweikangdev/keep-notes/commit/f7696ef1761c5360faae4233e647dd8e5ca6ecdd))
* reserve code block copy space ([6509a47](https://github.com/qiuweikangdev/keep-notes/commit/6509a4740436529db228e32655c01b308f634321))
* restore code block controls and focus ([14be15a](https://github.com/qiuweikangdev/keep-notes/commit/14be15a3747c6cc155cd9db88f5bdbfc2bd1ba80))
* validate code fence closings ([7498d1e](https://github.com/qiuweikangdev/keep-notes/commit/7498d1ef57aef2ca3720455f6cc8d3521f06f2c4))


### Features

* refine reminder list dialog ([0ad3828](https://github.com/qiuweikangdev/keep-notes/commit/0ad3828e32cd722b72eaa37bf969bb5eaf136f77))


## Commit Summary

- Compared with: v2.9.3
- Total commits: 13

## [2.9.3](https://github.com/qiuweikangdev/keep-notes/compare/v2.9.2...v2.9.3) (2026-07-08)


### Bug Fixes

* normalized unordered list markup ([75b93d0](https://github.com/qiuweikangdev/keep-notes/commit/75b93d00d5a271d51afbff8cdfd5149b44b583a0))


### Performance Improvements

* optimize editor performance for large documents ([fedec5d](https://github.com/qiuweikangdev/keep-notes/commit/fedec5d176940dfddca327fd6fcc7adf85e372da))


## Commit Summary

- Compared with: v2.9.2
- Total commits: 2

## [2.9.2](https://github.com/qiuweikangdev/keep-notes/compare/v2.9.1...v2.9.2) (2026-07-07)


### Bug Fixes

* editor list show ([8ef78e2](https://github.com/qiuweikangdev/keep-notes/commit/8ef78e2ae2bd18505732c1a647999c0034bcc5fe))


## Commit Summary

- Compared with: v2.9.1
- Total commits: 4

## [2.9.1](https://github.com/qiuweikangdev/keep-notes/compare/v2.9.0...v2.9.1) (2026-07-06)


### Bug Fixes

* editor inline code behavior ([a638b41](https://github.com/qiuweikangdev/keep-notes/commit/a638b410b0d48a2485983e32d789464c98539953))


## Commit Summary

- Compared with: v2.9.0
- Total commits: 3

# [2.9.0](https://github.com/qiuweikangdev/keep-notes/compare/v2.8.1...v2.9.0) (2026-07-05)


### Bug Fixes

* enable zoom keyboard shortcuts (Cmd+- / Cmd+=) ([1ab3ca9](https://github.com/qiuweikangdev/keep-notes/commit/1ab3ca930b2b04586dbc0954f57fef4620329d4e))
* preserve markdown list markers ([1ad3e01](https://github.com/qiuweikangdev/keep-notes/commit/1ad3e01854e925d0ca61651f1bdb2b984c95e1be))
* restore default appearance for mac notifications ([5197aaf](https://github.com/qiuweikangdev/keep-notes/commit/5197aafae3eb793afcd2e8d5944f313c19e3f9fb))


### Features

* automate semantic releases ([7b63e11](https://github.com/qiuweikangdev/keep-notes/commit/7b63e11bcbdf99332e308e49b7786901eb4b132b))


## Commit Summary

- Compared with: v2.8.1
- Total commits: 28
