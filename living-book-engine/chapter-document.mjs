/** Reads the owner-controlled chapter manuscript through the authenticated Docs API. */
export async function loadGoogleDocument({ documentId, getAccessToken, fetchImpl = fetch }) {
  if (!documentId) throw new Error('The chapter manifest does not identify its source document.');
  const session = await getAccessToken();
  if (!session?.token) { const error = new Error('Connect Google Drive to open this chapter.'); error.code = 'AUTH_REQUIRED'; throw error; }
  const url = `https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}?includeTabsContent=true`;
  const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${session.token}` }, cache: 'no-store' });
  if (response.status === 401 || response.status === 403) { const error = new Error(response.status === 401 ? 'Google Drive access token expired or was rejected (401).' : 'The connected Google account cannot access this Drive file (403).'); error.code = 'AUTH_REQUIRED'; error.status = response.status; throw error; }
  if (!response.ok) throw new Error(`Chapter document request failed (${response.status}).`);
  return response.json();
}

function paragraphFrom(element, inlineObjects) {
  const paragraph = element.paragraph;
  if (!paragraph) return null;
  let text = '';
  const images = [];
  for (const part of paragraph.elements || []) {
    text += part.textRun?.content || '';
    const objectId = part.inlineObjectElement?.inlineObjectId;
    if (objectId) {
      const embedded = inlineObjects?.[objectId]?.inlineObjectProperties?.embeddedObject;
      const source = embedded?.imageProperties?.contentUri;
      if (source) images.push({ src: source, alt: embedded.title || embedded.description || '' });
    }
  }
  text = text.replace(/[\r\n]+$/u, '');
  if (!text.trim() && !images.length) return null;
  return {
    text,
    style: paragraph.paragraphStyle?.namedStyleType || 'NORMAL_TEXT',
    speaker: /^\s*\(([^()]+)\)\s*$/u.exec(text)?.[1] || '',
    pageBreakBefore: Boolean(paragraph.paragraphStyle?.pageBreakBefore),
    images
  };
}

function collectContent(content, inlineObjects, output) {
  for (const item of content || []) {
    const paragraph = paragraphFrom(item, inlineObjects);
    if (paragraph) output.push(paragraph);
    for (const row of item.table?.tableRows || []) for (const cell of row.tableCells || []) collectContent(cell.content, inlineObjects, output);
  }
}

/** Converts Docs structural elements to readable text/illustration blocks without voicing speaker metadata. */
export function extractChapterParagraphs(document) {
  const paragraphs = [];
  const bodies = [];
  if (document.body?.content) bodies.push({ content: document.body.content, inlineObjects: document.inlineObjects });
  for (const tab of document.tabs || []) {
    const body = tab.documentTab?.body;
    if (body?.content) bodies.push({ content: body.content, inlineObjects: tab.documentTab.inlineObjects || document.inlineObjects });
  }
  for (const body of bodies) collectContent(body.content, body.inlineObjects, paragraphs);
  return paragraphs;
}

/** Forms readable manual-turn pages at paragraph boundaries; it adds no audio timing or automatic page turn. */
export function paginateChapterParagraphs(paragraphs, maxCharacters = 1400) {
  const pages = [];
  let blocks = [];
  let count = 0;
  const flush = () => { if (blocks.length) pages.push({ id: `chapter-01-page-${String(pages.length + 1).padStart(2, '0')}`, blocks }); blocks = []; count = 0; };
  for (const paragraph of paragraphs) {
    if (paragraph.pageBreakBefore && blocks.length) flush();
    const length = paragraph.text.length;
    if (blocks.length && count + length > maxCharacters) flush();
    blocks.push(paragraph);
    count += length;
  }
  flush();
  return pages;
}
