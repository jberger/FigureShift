import { describe, it, expect } from 'vitest';
import { editedFilename } from './editFiles';

describe('editedFilename', () => {
  it('appends -edited before the extension', () => {
    expect(editedFilename('IMG_1.jpg', [])).toBe('IMG_1-edited.jpg');
  });
  it('uniquifies when the name is taken', () => {
    expect(editedFilename('a.jpeg', ['a-edited.jpeg'])).toBe('a-edited-2.jpeg');
    expect(editedFilename('a.jpeg', ['a-edited.jpeg', 'a-edited-2.jpeg'])).toBe('a-edited-3.jpeg');
  });
  it('handles names with no extension', () => {
    expect(editedFilename('photo', [])).toBe('photo-edited');
  });
  it('is case-insensitive about collisions', () => {
    expect(editedFilename('A.JPG', ['a-edited.jpg'])).toBe('A-edited-2.JPG');
  });
});
