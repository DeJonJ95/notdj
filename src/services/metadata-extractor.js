// ID3 / MP4 tag extraction via jsmediatags. Returns normalized track metadata.
import jsmediatags from 'jsmediatags/dist/jsmediatags.min.js';

export function extractTags(file) {
  return new Promise((resolve) => {
    new jsmediatags.Reader(file).read({
      onSuccess: ({ tags }) => {
        let artwork = null;
        if (tags.picture) {
          const { data, format } = tags.picture;
          const bytes = new Uint8Array(data);
          artwork = new Blob([bytes], { type: format });
        }
        resolve({
          title: tags.title || file.name.replace(/\.[^.]+$/, ''),
          artist: tags.artist || '',
          album: tags.album || '',
          year: tags.year || '',
          genre: tags.genre || '',
          bpmTag: tags.TBPM?.data ? parseFloat(tags.TBPM.data) : null,
          keyTag: tags.TKEY?.data || null,
          artwork,
        });
      },
      onError: () => resolve({
        title: file.name.replace(/\.[^.]+$/, ''),
        artist: '', album: '', year: '', genre: '',
        bpmTag: null, keyTag: null, artwork: null,
      }),
    });
  });
}
