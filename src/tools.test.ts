import {describe, expect, it} from 'vitest';

import {extractData, extractFlag, parseToolFlags, visibleTools} from './tools.js';

describe('parseToolFlags', () => {
    const schema = {
        type: 'object' as const,
        properties: {
            name: {type: 'string'},
            count: {type: 'number'},
            verbose: {type: 'boolean'},
            tags: {type: 'array'},
            filters: {type: 'object'},
        },
    };

    it('parses string flags', () => {
        expect(parseToolFlags(['--name', 'hello'], schema).value!.parsed).toEqual({name: 'hello'});
    });

    it('parses number flags', () => {
        expect(parseToolFlags(['--count', '42'], schema).value!.parsed).toEqual({count: 42});
    });

    it('parses boolean flags', () => {
        expect(parseToolFlags(['--verbose'], schema).value!.parsed).toEqual({verbose: true});
    });

    it('parses array flags as JSON', () => {
        expect(parseToolFlags(['--tags', '["a","b"]'], schema).value!.parsed).toEqual({tags: ['a', 'b']});
    });

    it('parses object flags as JSON', () => {
        expect(parseToolFlags(['--filters', '{"view":"Grid","archived":false}'], schema).value!.parsed).toEqual({
            filters: {view: 'Grid', archived: false},
        });
    });

    it('reports unknown flags', () => {
        const result = parseToolFlags(['--unknown', 'val'], schema);
        expect(result.value!.parsed).toEqual({});
        expect(result.value!.unknownFlags).toEqual(['--unknown']);
    });

    it('parses multiple flags', () => {
        expect(parseToolFlags(['--name', 'hi', '--count', '5', '--verbose'], schema).value!.parsed).toEqual({
            name: 'hi',
            count: 5,
            verbose: true,
        });
    });
});

describe('extractData', () => {
    it('returns structuredContent if present', () => {
        expect(extractData({content: [], structuredContent: {foo: 1}})).toEqual({foo: 1});
    });

    it('parses JSON from text content', () => {
        expect(extractData({content: [{type: 'text', text: '{"a":1}'}]})).toEqual({a: 1});
    });

    it('returns raw text if not valid JSON', () => {
        expect(extractData({content: [{type: 'text', text: 'hello'}]})).toBe('hello');
    });

    it('returns null if no text content', () => {
        expect(extractData({content: [{type: 'image'}]})).toBeNull();
    });
});

describe('extractFlag', () => {
    it('extracts a flag and its value', () => {
        const args = ['--profile', 'work', '--other'];
        expect(extractFlag(args, '--profile')).toBe('work');
        expect(args).toEqual(['--other']);
    });

    it('returns null if flag not present', () => {
        const args = ['--other'];
        expect(extractFlag(args, '--profile')).toBeNull();
        expect(args).toEqual(['--other']);
    });
});

describe('visibleTools', () => {
    it('filters out tools with hideFromCli meta', () => {
        const tools = [
            {name: 'visible', inputSchema: {type: 'object' as const}} as any,
            {name: 'hidden', inputSchema: {type: 'object' as const}, _meta: {hideFromCli: true}} as any,
        ];
        expect(visibleTools(tools).map((t: any) => t.name)).toEqual(['visible']);
    });

    it('keeps tools with no _meta', () => {
        const tools = [{name: 'a', inputSchema: {type: 'object' as const}} as any];
        expect(visibleTools(tools)).toHaveLength(1);
    });
});
