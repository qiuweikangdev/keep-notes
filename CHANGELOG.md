# [2.14.0](https://github.com/qiuweikangdev/keep-notes/compare/v2.13.0...v2.14.0) (2026-07-17)


### Bug Fixes

* activate main window from reminder popup ([dae2f3f](https://github.com/qiuweikangdev/keep-notes/commit/dae2f3fb52763f21cf5729a7a9c3c9152059da43))
* make reminder shortcut reliable on startup ([5233e5a](https://github.com/qiuweikangdev/keep-notes/commit/5233e5ad71d3171213faa7699d8247cf98bf89a2))
* position floating reminder repeat menu ([02c14d7](https://github.com/qiuweikangdev/keep-notes/commit/02c14d7967ac3d4381e9843528a69e3977a5299c))
* resolve merge conflicts ([a9498eb](https://github.com/qiuweikangdev/keep-notes/commit/a9498eb81b14efb63bb54091aafdfd2933c63310))
* skip save prompt for synced floating editors ([cc851f2](https://github.com/qiuweikangdev/keep-notes/commit/cc851f2ab0d837687b4b8a6f5970889dcbc60378))
* stabilize editor search and code selection highlights ([3b00d0b](https://github.com/qiuweikangdev/keep-notes/commit/3b00d0beb138403a21d4429bf62680030565cb23))
* stabilize reminder floating window layout ([aac9477](https://github.com/qiuweikangdev/keep-notes/commit/aac9477ca61bba28d63766720989e20c0d220b68))
* sync floating editor content in real time ([0ca2a76](https://github.com/qiuweikangdev/keep-notes/commit/0ca2a76d9ff5c3904c01ea73eb1e14cb266943d3))
* transfer quick editor drafts reliably ([4cf38f5](https://github.com/qiuweikangdev/keep-notes/commit/4cf38f582407d5a6d0b2c17ed62f50945f94c9bd))
* unify move confirmation dialog ([24b494c](https://github.com/qiuweikangdev/keep-notes/commit/24b494c7af7a2299b4c959195e5feed5fe495199))
* update editor empty state placeholder ([a1c399d](https://github.com/qiuweikangdev/keep-notes/commit/a1c399dea4f2ea8459a93182799e51071284f7cf))


### Features

* add discard confirmation warning icon ([81fc141](https://github.com/qiuweikangdev/keep-notes/commit/81fc141b753e2e8f5b5da6a44916e53f95b72a67))
* add quick editor floating window ([f523ea6](https://github.com/qiuweikangdev/keep-notes/commit/f523ea6f2a9eb6f82278a9788fbcfbd8a397a63d))
* improve git file actions ([85a67c3](https://github.com/qiuweikangdev/keep-notes/commit/85a67c37b7b19770b41b3f0a2b522379da3708bf))
* improve reminder floating windows ([c0de14d](https://github.com/qiuweikangdev/keep-notes/commit/c0de14d49ac3cb02f711053dab3d55b2cdca0982))
* optimize reminder floating windows ([dfc3695](https://github.com/qiuweikangdev/keep-notes/commit/dfc36958ca68a1f8c85cd0f5c19efc6b7a5f7095))
* restore source tab from floating editor ([0f7c746](https://github.com/qiuweikangdev/keep-notes/commit/0f7c74630f1416c391450eee796a81a28359183b))
* support multiple quick editor windows ([f19d912](https://github.com/qiuweikangdev/keep-notes/commit/f19d912cb419cd888a0e2a583418590d8c0e6cdf))


## Commit Summary

- Compared with: v2.13.0
- Total commits: 26

# [2.13.0](https://github.com/qiuweikangdev/keep-notes/compare/v2.12.0...v2.13.0) (2026-07-16)


### Bug Fixes

* allow dialogs to resize beyond defaults ([d6971c5](https://github.com/qiuweikangdev/keep-notes/commit/d6971c530acc681a7a5318c8b818d5936a4723c4))
* avoid duplicate delete confirmation ([f45bd68](https://github.com/qiuweikangdev/keep-notes/commit/f45bd68ea5806c49db46025c8f33a957f60a1263))
* harden draft close save bridge ([af29ca6](https://github.com/qiuweikangdev/keep-notes/commit/af29ca649823f801e2655540d48a2d288552ebfe))
* improve code cursor and popover visibility ([c9b3302](https://github.com/qiuweikangdev/keep-notes/commit/c9b3302acc622c1a4b140486ca810263f6db99da))
* increase code block cursor contrast ([8ece722](https://github.com/qiuweikangdev/keep-notes/commit/8ece722fb53dad34f34ffbb0e01083c052b3285f))
* isolate window close state ([cf0ca29](https://github.com/qiuweikangdev/keep-notes/commit/cf0ca29ce9696acf0ca0baa3b697449c1bed1300))
* keep code block cursor visible ([c5c4ffe](https://github.com/qiuweikangdev/keep-notes/commit/c5c4ffe72cd3bdba742d009f1db3f6300de05b2d))
* preserve code block cursor focus ([d164908](https://github.com/qiuweikangdev/keep-notes/commit/d164908a75431394f40cb48a13a047e17e01d12d))
* preserve code cursor width across zoom ([47811f5](https://github.com/qiuweikangdev/keep-notes/commit/47811f54ccd3072983a3943385a34041632853b7))
* preserve edited untitled tabs ([981756c](https://github.com/qiuweikangdev/keep-notes/commit/981756c49bf162f70f1b2254c320dccac4ff8f05))
* preserve nested quote lists ([6ffa2bf](https://github.com/qiuweikangdev/keep-notes/commit/6ffa2bf61de5cf0b2dfcc7671d8e0c6436fe60cb))
* preserve parent quote side menu hover ([c16c54c](https://github.com/qiuweikangdev/keep-notes/commit/c16c54c831c47cdde42df6e2b6ec99e1f8b3f498))
* prevent git dialog drag offset ([2245e7c](https://github.com/qiuweikangdev/keep-notes/commit/2245e7cae7c5ff1b812a2214f6b8526c92e658f4))
* refine reminder editor backdrop and hover ([90cf386](https://github.com/qiuweikangdev/keep-notes/commit/90cf3860422d785ee2c4458e68cd3f46e6ac7e05))
* route file drops from rich editor panes ([fcb096e](https://github.com/qiuweikangdev/keep-notes/commit/fcb096ee56038c765aded221b20f9a5f8c8bff76))
* save untitled drafts before closing ([46a99e4](https://github.com/qiuweikangdev/keep-notes/commit/46a99e49de97ae71eee92c8fa3260dbbbdbd1eca))
* show cursor in empty code blocks ([f9dea24](https://github.com/qiuweikangdev/keep-notes/commit/f9dea24fda4eec6d0119afe3142c36379886a3dd))
* stabilize block drag targets across editor surfaces ([4c10bfc](https://github.com/qiuweikangdev/keep-notes/commit/4c10bfcc16d5566098225f11db07f30024004298))
* track dirty drafts across tabs ([a77b341](https://github.com/qiuweikangdev/keep-notes/commit/a77b34158f81b741624732d407d44694f1a223d9))
* validate close save snapshots ([956f50a](https://github.com/qiuweikangdev/keep-notes/commit/956f50a1e8bc27e126fd0b8eb52d47b46c6064e7))


### Features

* file tree sort ([87597e6](https://github.com/qiuweikangdev/keep-notes/commit/87597e6cd439594a293301d6a5872c69874dfe99))
* make settings dialog responsive ([3be1158](https://github.com/qiuweikangdev/keep-notes/commit/3be1158ef46cde6bef111f0ebd56c3a480c2c283))
* move deleted files to system trash ([e61b381](https://github.com/qiuweikangdev/keep-notes/commit/e61b38113210f1a906a50f55ab0c486444d49e21))
* optimize git pop-up ([8e7ba8b](https://github.com/qiuweikangdev/keep-notes/commit/8e7ba8ba387dd7c1b01c694f6f726db15ef7ff6a))
* resize and drag git dialog ([1f724ff](https://github.com/qiuweikangdev/keep-notes/commit/1f724fff0c7bd5adb76950093fc023194b62cb6f))
* share dialog drag and resize behavior ([962aac9](https://github.com/qiuweikangdev/keep-notes/commit/962aac9d1f8db4901717cfb409565ecfde3cbbd1))


## Commit Summary

- Compared with: v2.12.0
- Total commits: 44

# [2.12.0](https://github.com/qiuweikangdev/keep-notes/compare/v2.11.0...v2.12.0) (2026-07-14)


### Bug Fixes

* animate file tree scrollbar on hover ([d2c471c](https://github.com/qiuweikangdev/keep-notes/commit/d2c471cb63de96e60c60171898f4d2568eb56e08))
* enable file tree scrollbar interaction ([bb571d5](https://github.com/qiuweikangdev/keep-notes/commit/bb571d5fd90b16f8976360f8166f4bf9bed860c7))
* fade out file tree scrollbar ([627bb84](https://github.com/qiuweikangdev/keep-notes/commit/627bb84d119d8c5b60991d6100ea231197efc16e))
* hide root search result paths ([cf91fd3](https://github.com/qiuweikangdev/keep-notes/commit/cf91fd309b09487d086a1f6841102d595f48f41c))
* improve tree name conflict feedback ([b822579](https://github.com/qiuweikangdev/keep-notes/commit/b8225797e20a42f1d108d2a515d93ae03144759d))
* improve window zoom controls ([53676da](https://github.com/qiuweikangdev/keep-notes/commit/53676da7aece48e9d70410320d837537019a7b5c))
* prevent code block theme flicker ([c738b82](https://github.com/qiuweikangdev/keep-notes/commit/c738b82d2bd494c678e7dac60e0da678c16fc350))
* prevent git panel loading flicker ([5437a44](https://github.com/qiuweikangdev/keep-notes/commit/5437a443e37dfe2e9db76c45b9b27ed9ca398c56))
* prevent rich editor opacity ghosting ([7bfe2a1](https://github.com/qiuweikangdev/keep-notes/commit/7bfe2a14f479a72a0c9a5761e8210aa74a056acd))
* render git panel above editor ([9454e54](https://github.com/qiuweikangdev/keep-notes/commit/9454e54f8445d6db16480531446d7109d8379f39))
* render global search above editor ([234e50e](https://github.com/qiuweikangdev/keep-notes/commit/234e50e9766b8e86ac4cbe105da75cf0326e02e1))
* reset editor state after full-document deletion ([9b41eab](https://github.com/qiuweikangdev/keep-notes/commit/9b41eab77a04b34fa7c02d2bce4eadd53a413c35))
* restore rich editor transparency ([56978dd](https://github.com/qiuweikangdev/keep-notes/commit/56978dde0d3f302ad1c70cd00356d2ffb4e56f5e))
* show sidebar divider while resizing ([d1b39de](https://github.com/qiuweikangdev/keep-notes/commit/d1b39dea9534082c7161f01ece6e625193b7c574))
* stabilize editor panel divider ([2f92f23](https://github.com/qiuweikangdev/keep-notes/commit/2f92f23c8447c9a12cae67175b7d7b4bc002c905))
* sync outline activation with editor viewport ([a468c15](https://github.com/qiuweikangdev/keep-notes/commit/a468c15ef0ef933f0a00f6f25323c675dd63c7ab))
* theme diff viewer empty surface ([81db5cd](https://github.com/qiuweikangdev/keep-notes/commit/81db5cd50968639e5b21cce37dcdff22ad7bd2af))
* toast portal ([356200b](https://github.com/qiuweikangdev/keep-notes/commit/356200b2f48989a60bbd0de574729669581bf742))


### Features

* git panel icon ([3ea9bf6](https://github.com/qiuweikangdev/keep-notes/commit/3ea9bf6862e621e8165b697c42b95bd0263a05dc))
* optimize editor tab operations ([ff72ba1](https://github.com/qiuweikangdev/keep-notes/commit/ff72ba13dc82609c58a38df0144c5358e93889c1))
* show git footer operation loading ([cd5eff0](https://github.com/qiuweikangdev/keep-notes/commit/cd5eff0f3cfa43749402fd4816e1cd5a52c58fca))


## Commit Summary

- Compared with: v2.11.0
- Total commits: 27

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
