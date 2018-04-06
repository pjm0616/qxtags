#!/usr/bin/env node
//@flow
'use strict';

const assert = require('assert');
const fs = require('fs');
const {EventEmitter} = require('events');
const pathlib = require('path');

const esprima = require('esprima');
const esquery = require('esquery');
const escodegen = require('escodegen');


/*::

type Ast = Object;

type ClassInfo = {|
    srcPath: string,
    name: string,
    bodyT: Ast,

    type: null | 'abstract' | 'singleton',
    extend: ?Tag,
    include: Tag[],
    implement: Tag[],
    methods: Tag[],
    properties: Tag[],
    statics: Tag[],
    events: Tag[],
|};

type Tag = {|
    name: string,
    t: Ast,
    signature?: string,
|};

type SrcInfo = {|
    clsnames: string[],
|};

*/

class SrcMgr {
    /*::
    srcs: Map<string, SrcInfo>;
    classes: Map<string, ClassInfo>;
    */

    constructor() {
        this.srcs = new Map();
        this.classes = new Map();
    }

    checkFile(path/*: string*/) {
        assert(path === pathlib.resolve(path));

        this._removeSrc(path);

        let src;
        try {
            src = fs.readFileSync(path, 'utf8');
        } catch (err) {
            if (err.code === 'ENOENT') {
                return false;
            }
            throw err;
        }

        this._addSrc(path, src);
    }

    _removeSrc(path/*: string*/)/*: boolean*/ {
        let si = this.srcs.get(path);
        if (!si) {
            return false;
        }
        for (let clsname of si.clsnames) {
            this.classes.delete(clsname);
        }
        this.srcs.delete(path);
        return true;
    }
    _addSrc(path/*: string*/, src/*: string*/) {
        const cfg = {
            range: true,
            loc: true,
            tolerant: false,
            tokens: true,
            comment: true,
        };
        let t/*: Ast*/ = esprima.parseScript(src, cfg);

        // Collect classes.
        let classes = this._parseClasses(path, t);

        let srcInfo = {
            clsnames: [],
        };
        // Update srcInfo.
        for (let cls of classes) {
            srcInfo.clsnames.push(cls.name);
        }

        // Add to the class list.
        this.srcs.set(path, srcInfo);
        for (let cls of classes) {
            this.classes.set(cls.name, cls);
        }
    }

    _parseClasses(path/*: string*/, t/*: Ast*/)/*: ClassInfo[]*/ {
        let classes = [];
        for (let candidate of esquery.query(t,'Program>ExpressionStatement>CallExpression')) {
            let callee = escodegen.generate(candidate.callee);
            if (callee !== 'qx.Class.define') {
                continue;
            }
            let name = candidate.arguments[0].value;
            let bodyT = candidate.arguments[1];
            let cls = this._parseClass(path, name, bodyT);

            let prev = this.classes.get(name);
            if (prev != null) {
                if (prev.srcPath !== path) {
                    throw new Error('duplicate class name');
                }
            }
            classes.push(cls);
        }
        return classes;
    }
    _parseClass(srcPath/*: string*/, name/*: string*/, bodyT/*: Ast*/)/*: ClassInfo*/ {
        let cls/*: ClassInfo*/ = {
            srcPath: srcPath,
            name: name,
            bodyT: bodyT,

            type: null,
            extend: null,
            include: [],
            implement: [],
            methods: [],
            properties: [],
            statics: [],
            events: [],
        };
        for (let t of bodyT.properties) {
            assert(t.type === 'Property');
            let name = t.key.name;
            let valT = t.value;
            switch (name) {
            case 'extend':
                cls.extend = {
                    name: escodegen.generate(valT),
                    t: valT,
                };
                break;
            case 'include':
                if (valT.type === 'ArrayExpression') {
                    cls.include = valT.elements.map(t => {
                        return {
                            name: escodegen.generate(t),
                            t: t,
                        };
                    });
                } else {
                    cls.include = [{
                        name: escodegen.generate(valT),
                        t: valT,
                    }];
                }
                break;
            case 'implement':
                if (valT.type === 'ArrayExpression') {
                    cls.implement = valT.elements.map(t => {
                        return {
                            name: escodegen.generate(t),
                            t: t,
                        };
                    });
                } else {
                    cls.implement = [{
                        name: escodegen.generate(valT),
                        t: valT,
                    }];
                }
                break;
            case 'construct':
                cls.methods.push({
                    name: '[constructor]',
                    t: valT,
                    signature: '('+valT.params.map(t => escodegen.generate(t)).join(', ')+')',
                });
                break;
            case 'destruct':
                cls.methods.push({
                    name: '[destructor]',
                    t: valT,
                    signature: '('+valT.params.map(t => escodegen.generate(t)).join(', ')+')',
                });
                break;
            case 'statics':
                for (let prop of valT.properties) {
                    cls.statics.push({
                        name: prop.key.type==='Identifier' ? prop.key.name : prop.key.value,
                        t: prop.value,
                    });
                }
                break;
            case 'members':
                for (let prop of valT.properties) {
                    if (prop.value.type === 'FunctionExpression') {
                        cls.methods.push({
                            name: prop.key.type==='Identifier' ? prop.key.name : prop.key.value,
                            t: prop.value,
                            signature: '('+prop.value.params.map(t => escodegen.generate(t)).join(', ')+')',
                        });
                    } else {
                        cls.properties.push({
                            name: prop.key.type==='Identifier' ? prop.key.name : prop.key.value,
                            t: prop.value,
                            signature: '(='+escodegen.generate(prop.value)+')',
                        });
                    }
                }
                break;
            case 'properties':
                for (let prop of valT.properties) {
                    cls.properties.push({
                        name: prop.key.type==='Identifier' ? prop.key.name : prop.key.value,
                        t: prop.value,
                    });
                }
                break;
            case 'events':
                for (let prop of valT.properties) {
                    cls.events.push({
                        name: prop.key.type==='Identifier' ? prop.key.name : prop.key.value,
                        t: prop.value,
                    });
                }
                break;
            case 'include':
                break;
            case 'type':
                cls.type = escodegen.generate(valT);
                break;
            case 'environment':
                break;
            case 'defer':
                break;
            default:
                console.warn('Unknown class property type: ' + name);
                break;
            }
        }
        return cls;
    }

    /*
     * :vimrc:
     * ```
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
     * ```
    */
    genCtags()/*: string*/ {
        let buf/*: string[]*/ = [];
        buf.push(`!_TAG_FILE_FORMAT	2
!_TAG_FILE_SORTED	1	/0=unsorted, 1=sorted/
!_TAG_PROGRAM_NAME	qxtags
!_TAG_PROGRAM_VERSION	0.1
`);
        for (let cls of this.classes.values()) {
            buf.push([cls.name, cls.srcPath, cls.bodyT.loc.start.line+';"', 'c', 'line:'+cls.bodyT.loc.start.line, 'type:class'].join('\t')+'\n')

            if (cls.extend != null) {
                buf.push([cls.extend.name, cls.srcPath, cls.extend.t.loc.start.line+';"', 'x', 'line:'+cls.extend.t.loc.start.line, 'ctype:'+cls.name].join('\t')+'\n')
            }

            let members/*: Array<{|kind: string, name: string, lineno: number, signature?: string|}>*/ = [];
            for (let m of cls.include) {
                members.push({
                    kind: 'n',
                    name: m.name,
                    lineno: m.t.loc.start.line,
                    signature: m.signature,
                });
            }
            for (let m of cls.implement) {
                members.push({
                    kind: 'i',
                    name: m.name,
                    lineno: m.t.loc.start.line,
                    signature: m.signature,
                });
            }
            for (let m of cls.methods) {
                members.push({
                    kind: 'm',
                    name: m.name,
                    lineno: m.t.loc.start.line,
                    signature: m.signature,
                });
            }
            for (let m of cls.properties) {
                members.push({
                    kind: 'p',
                    name: m.name,
                    lineno: m.t.loc.start.line,
                    signature: m.signature,
                });
            }
            for (let m of cls.statics) {
                members.push({
                    kind: 's',
                    name: m.name,
                    lineno: m.t.loc.start.line,
                    signature: m.signature,
                });
            }
            for (let m of cls.events) {
                members.push({
                    kind: 'e',
                    name: m.name,
                    lineno: m.t.loc.start.line,
                    signature: m.signature,
                });
            }

            members.sort((a, b) => a.lineno - b.lineno);
            for (let entry of members) {
                let access;
                if (entry.name.startsWith('__')) {
                    access = 'protected';
                } else if (entry.name.startsWith('_')) {
                    access = 'private';
                } else {
                    access = 'public';
                }
                let tags = [entry.name, cls.srcPath, entry.lineno+';"', entry.kind, 'line:'+entry.lineno, 'ctype:'+cls.name, 'access:'+access];
                if (entry.signature != null) {
                    tags.push('signature:' + entry.signature);
                }

                buf.push(tags.join('\t')+'\n')
            }
        }
        return buf.join('');
    }
}

class DirMgr extends EventEmitter {
    /*::
    dirs: Set<string>;
    srcm: SrcMgr;
    */

    constructor() {
        super();

        this.dirs = new Set();
        this.srcm = new SrcMgr();
    }

    scan(path/*: string*/) {
        assert(path === pathlib.resolve(path));
        let dirQ = [path];

        while (true) {
            let path = dirQ.shift();
            if (!path) {
                break;
            }

            let names;
            try {
                names = fs.readdirSync(path);
            } catch (err) {
                if (err.code === 'ENOENT') {
                    this._rm(path);
                    continue;
                }
                throw err;
            }

            if (this.dirs.has(path)) {
                continue;
            }

            for (let name of names) {
                let path2 = pathlib.join(path, name);
                let st = fs.statSync(path2);

                if (st.isDirectory()) {
                    dirQ.push(path2);
                } else if (st.isFile() && path2.endsWith('.js')) {
                    this.srcm.checkFile(path2);
                }
            }

            const newlyAdded = !this.dirs.has(path);
            this.dirs.add(path);

            if (newlyAdded) {
                this.emit('add', path);
            }
        }
    }

    _rm(path/*: string*/)/*: boolean*/ {
        if (!this.dirs.has(path)) {
            return false;
        }

        this.dirs = new Set([...this.dirs].filter(s => !s.startsWith(path)));

        let rmSrcs = [...this.srcm.srcs.keys()].filter(s => s.startsWith(path));
        for (let srcPath of rmSrcs) {
            this.srcm.checkFile(srcPath);
        }

        this.emit('rm', path);
        return true;
    }
}


/*
let dm = new DirMgr();
dm.on('add', path => {
    console.log('add', path);
});
dm.on('rm', path => {
    console.log('rm', path);
});
dm.scan(pathlib.resolve('./source/class'));
//dm.scan(pathlib.resolve('./node_modules/qooxdoo/framework/source/class'));
*/

let sm = new SrcMgr();

for (let path of process.argv.slice(2)) {
    sm.checkFile(pathlib.resolve(path));
}

console.log(sm.genCtags());
