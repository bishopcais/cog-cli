import { describe, expect, jest, test } from '@jest/globals';
import path from 'path';

import { getCogFiles, getCogIds, loadCogFile } from '../src/cog';

const dataDir = path.join(__dirname, 'data');

describe('loadCogFile', () => {
  describe('error conditions', () => {
    const errorStr = 'Error loading and parsing .*/test/data';
    test('non-existant file throws', () => {
      expect(() => loadCogFile(path.join(dataDir, 'totally_fake_file'))).toThrow(new RegExp(`${errorStr}/totally_fake_file`));
    });
    test('invalid JSON file throws', () => {
      expect(() => loadCogFile(path.join(dataDir, 'invalid_cog'))).toThrow(new RegExp(`${errorStr}/invalid_cog`));
    });
  });

  test('loading empty cog file uses defaults', () => {
    expect(loadCogFile(path.join(dataDir, 'empty_cog.json'))).toEqual({
      cwd: dataDir,
      watcher: 'http://localhost:7777',
    });
  });

  test('load cog with cwd set', () => {
    expect(loadCogFile(path.join(dataDir, 'cog_with_cwd.json'))).toEqual({
      cwd: '/my/custom/cwd',
      watcher: 'http://localhost:7777',
    });
  });

  test('load cog with watcher set', () => {
    expect(loadCogFile(path.join(dataDir, 'cog_with_watcher.json'))).toEqual({
      cwd: dataDir,
      watcher: 'https://example.com',
    });
  });
});

describe('getCogFiles', () => {
  test('loading recursive directory', () => {
    expect(getCogFiles(path.join(dataDir, 'nested_cog_dir'))).toEqual([
      'nested_cog_dir/folder_1/cog.json',
      'nested_cog_dir/folder_2/cog.json',
      'nested_cog_dir/folder_3/folder_4/cog.json',
      'nested_cog_dir/folder_3/folder_5/folder_6/cog.json',
      'nested_cog_dir/folder_3/folder_5/folder_7/cog.json',
    ].map((file) => path.join(dataDir, file)));
  });

  test('loading single file', () => {
    const cogPath = path.join(dataDir, 'empty_cog.json');
    expect(getCogFiles(cogPath)).toEqual([cogPath]);
  });

  test('throws exception on non-existing file', () => {
    expect(() => getCogFiles('totally_fake_path')).toThrow(/totally_fake_path - file not found/);
  });
});

describe('getCogIds', () => {
  test('non-file string returns string', () => {
    expect(getCogIds('foobar')).toEqual(['foobar']);
  });

  test('getting ids from recursive directory', () => {
    expect(getCogIds(path.join(dataDir, 'nested_cog_dir'))).toEqual([
      'folder_1',
      'folder_2',
      'folder_4',
      'folder_6',
      'folder_7',
    ]);
  });

  test('prints to console.error on invalid file', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { /* pass */ });
    expect(getCogIds(path.join(dataDir, 'invalid_cog'))).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringMatching(/Error loading and parsing .*\/invalid_cog/));
  });
});
