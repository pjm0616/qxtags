# qxtags
[qooxdoo][] class system support for vim [Tagbar][] plugin.

## Vim configuration
```
Bundle 'majutsushi/tagbar'
...

let g:tagbar_type_javascript = {
    \ 'ctagstype' : 'javascript',
    \ 'kinds'     : [
        \ 'c:class',
        \ 'x:extends',
        \ 'n:include',
        \ 'i:implements',
        \ 'm:methods',
        \ 'p:properties',
        \ 'e:events',
        \ 's:statics',
    \ ],
    \ 'sro' : '.',
    \ 'kind2scope' : {
        \ 'c' : 'ctype',
    \ },
    \ 'scope2kind' : {
        \ 'ctype' : 'c',
    \ },
    \ 'ctagsbin'  : 'qxtags',
    \ 'ctagsargs' : ''
\ }
```

## Notes
* Not compatible with ctags: It doesn't support any command line options - only filenames are accepted.
* Does not handle regular javascript sources: Once installed, tagbar will only work with qooxdoo sources.
* Only classes are supported.

[qooxdoo]: https://github.com/qooxdoo/qooxdoo
[tagbar]: https://github.com/majutsushi/tagbar
