import { createFromRoot } from 'codama';
import { rootNodeFromAnchor } from '@codama/nodes-from-anchor';
import { renderVisitor as renderJavaScriptVisitor } from "@codama/renderers-js";
import anchorIdl from '../programs/Turbin3-prereq.json';
import path from 'path';
const codama = createFromRoot(rootNodeFromAnchor(anchorIdl));
const jsClient = path.join(import.meta.dirname, "..", "clients", "js");
codama.accept(renderJavaScriptVisitor(path.join(jsClient, "src", "generated")));
//# sourceMappingURL=generate-client.js.map