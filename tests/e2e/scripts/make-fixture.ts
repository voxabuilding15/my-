/** Writes the PDF the E2E upload flow picks from the device's Downloads folder. */
import { writeFileSync } from 'node:fs';

import { makePdf, studyPages } from '../../integration/src/fixtures.ts';

const out = process.argv[2] ?? 'studexa-e2e-biology.pdf';
writeFileSync(out, makePdf(studyPages(6, 25)));
console.log(`wrote ${out}`);
