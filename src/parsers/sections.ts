import { parse, HTMLElement, Node, NodeType } from "node-html-parser";
import type { ParsedArticle, Section } from "../types.js";

const HEADING_TAGS = new Set(["h1", "h2", "h3"]);
const STRIP_TAGS = new Set(["script", "style"]);

function textOf(node: Node): string {
  return node.text.replace(/\s+/g, " ").trim();
}

function isHeading(node: Node): node is HTMLElement {
  return (
    node.nodeType === NodeType.ELEMENT_NODE &&
    HEADING_TAGS.has((node as HTMLElement).tagName.toLowerCase())
  );
}

function htmlOf(nodes: Node[]): string {
  return nodes
    .map((n) =>
      n.nodeType === NodeType.ELEMENT_NODE ? (n as HTMLElement).outerHTML : n.text,
    )
    .join("\n")
    .trim();
}

export function parseArticle(html: string): ParsedArticle {
  const root = parse(html);
  for (const tag of STRIP_TAGS) {
    root.querySelectorAll(tag).forEach((n) => n.remove());
  }

  const body = root.querySelector("body") ?? root;
  const children = body.childNodes.filter(
    (n) => n.nodeType !== NodeType.TEXT_NODE || textOf(n).length > 0,
  );

  let title = "";
  const introNodes: Node[] = [];
  const sections: Section[] = [];
  let currentHeading: string | null = null;
  let currentBody: Node[] = [];

  const flush = () => {
    if (currentHeading !== null) {
      const bodyHtml = htmlOf(currentBody);
      sections.push({
        heading: currentHeading,
        bodyHtml,
        bodyText: parse(bodyHtml).text.replace(/\s+/g, " ").trim(),
      });
    }
    currentBody = [];
  };

  for (const node of children) {
    if (isHeading(node)) {
      const tag = node.tagName.toLowerCase();
      const text = textOf(node);
      if (!title && tag === "h1") {
        title = text;
        continue;
      }
      if (tag === "h1" || tag === "h2") {
        flush();
        currentHeading = text;
        continue;
      }
    }
    if (currentHeading === null) introNodes.push(node);
    else currentBody.push(node);
  }
  flush();

  if (!title && sections.length > 0) {
    title = sections[0].heading;
  }

  return {
    title,
    intro: htmlOf(introNodes),
    sections,
  };
}
