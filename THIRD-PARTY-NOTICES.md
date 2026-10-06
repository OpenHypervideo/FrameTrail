# Third-Party Notices

FrameTrail is licensed under MIT (see [LICENSE.md](LICENSE.md)). It contains third-party code, libraries and fonts under their own licenses. All of them are listed here, followed by the license texts those licenses require. The build strips comments from the bundled files, and this file ships with every build, so this file is where their notices live.

## Code ported or adapted into FrameTrail files

### HyperFrames

- Project: HyperFrames — https://github.com/heygen-com/hyperframes
- Copyright 2026 HeyGen, Inc.
- License: Apache License, Version 2.0 (full text below)

The following FrameTrail files contain code ported or adapted from HyperFrames. All of them were modified for FrameTrail: rewritten in plain JavaScript without GSAP, driven by FrameTrail's video-synced CSS animations, and integrated into FrameTrail's overlay types. Each file names its source in a header comment.

| FrameTrail file | Ported / adapted from (HyperFrames) |
|---|---|
| `src/_shared/modules/AnimationLibrary/module.js` | Spring and wiggle easing math (`packages/core/src/parsers/springEase.ts`, `packages/core/src/runtime/wiggleEase.ts`) |
| `src/_shared/types/ResourceHotspot/type.js` (`renderSvgStroke`, `svgShapePath`) | Arrow stroke geometry after the `hw-arrow` and `svg-stroke-trace` registry components |
| `src/_shared/types/ResourceCounter/type.js` | `count-up` and `number-wheel` registry components |
| `src/_shared/types/ResourceChart/type.js` | `chart-story` and `conic-progress-ring` registry components |
| `src/_shared/types/ResourceCursor/type.js` | Inspired by the `oversized-cursor` and `dart-cursor` registry components |

No HyperFrames catalog assets, fonts or logos are included, and FrameTrail does not use GSAP.

### OpenGraph

- Project: OpenGraph for PHP — https://github.com/scottmac/opengraph
- Copyright 2010 Scott MacVicar
- License: Apache License, Version 2.0 (full text below)

`src/_server/opengraph.php` is that project's `OpenGraph.php`, modified for FrameTrail. Among other changes, pages are fetched through `ftFetchPublicUrl()`, which only reaches public addresses.

## Vendored libraries (`src/_lib/`)

| Library | Version | Files | License | Copyright |
|---|---|---|---|---|
| CodeMirror 6 | see below | `codemirror6/cm6.bundle.js` | MIT | Marijn Haverbeke and others (see below) |
| CollisionDetection, based on jQuery Collision Detection | 1.0, modified for FrameTrail | `collisiondetection/collisiondetection.js` | MIT (dual-licensed MIT/GPL upstream, used under MIT) | Copyright (c) 2014 HN Leussink |
| fflate | 0.8.2 | `fflate/fflate.min.js` | MIT | Copyright (c) 2023 Arjun Barrett |
| hls.js | 1.6.15 | `hlsjs/hls.min.js` | Apache-2.0 | Copyright (c) 2017 Dailymotion (http://www.dailymotion.com). Parts derived from the HLS library for video.js (https://github.com/videojs/videojs-contrib-hls), Copyright (c) 2013-2015 Brightcove |
| interact.js | 1.10.27 | `interactjs/interact.min.js` | MIT | Copyright (c) 2012-present Taye Adeyemi <dev@taye.me> |
| Leaflet | 1.9.4 | `leaflet/leaflet.js`, `leaflet/leaflet.css` | BSD-2-Clause | Copyright (c) 2010-2023, Volodymyr Agafonkin; Copyright (c) 2010-2011, CloudMade |
| Quill | 2.0.3 | `quill/quill.min.js`, `quill/quill.snow.css` | BSD-3-Clause | Copyright (c) 2017-2024, Slab; Copyright (c) 2014, Jason Chen; Copyright (c) 2013, salesforce.com |
| SortableJS | 1.15.7 | `sortablejs/Sortable.min.js` | MIT | Copyright (c) 2019 All contributors to Sortable |
| vtt.js | 0.12.1 | `parsers/vtt.min.js` | Apache-2.0 | Copyright 2013 vtt.js Contributors |

The CodeMirror 6 bundle is built by `scripts/build-codemirror6.sh` from these packages (versions pinned in `scripts/package-lock.json`), all under the MIT License:

| Package | Version | Copyright |
|---|---|---|
| `@codemirror/commands` | 6.10.2 | Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others |
| `@codemirror/language` | 6.12.1 | Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others |
| `@codemirror/legacy-modes` | 6.5.2 | Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others |
| `@codemirror/lint` | 6.9.4 | Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others |
| `@codemirror/state` | 6.5.4 | Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others |
| `@codemirror/theme-one-dark` | 6.1.3 | Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others |
| `@codemirror/view` | 6.39.15 | Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others |
| `@lezer/common` | 1.5.1 | Copyright (C) 2018 by Marijn Haverbeke <marijn@haverbeke.berlin> and others |
| `@lezer/highlight` | 1.2.3 | Copyright (C) 2018 by Marijn Haverbeke <marijn@haverbeke.berlin> and others |
| `@lezer/lr` | 1.4.8 | Copyright (C) 2018 by Marijn Haverbeke <marijn@haverbeke.berlin> and others |
| `@marijn/find-cluster-break` | 1.0.2 | Copyright (C) 2024 by Marijn Haverbeke <marijn@haverbeke.berlin> |
| `crelt` | 1.0.6 | Copyright (C) 2020 by Marijn Haverbeke <marijn@haverbeke.berlin> |
| `style-mod` | 4.1.3 | Copyright (C) 2018 by Marijn Haverbeke <marijn@haverbeke.berlin> and others |
| `w3c-keyname` | 2.2.8 | Copyright (C) 2016 by Marijn Haverbeke <marijn@haverbeke.berlin> and others |

`dialog/`, `tabsjs/` and `codemirror6/cm6linters.js` in `src/_lib/` are FrameTrail's own code (MIT).

## Fonts

| Font | Files | License | Copyright |
|---|---|---|---|
| Titillium Web | `src/_shared/fonts/Titillium_Web/*.woff2` | SIL Open Font License, Version 1.1 | Copyright (c) 2009-2011 by Accademia di Belle Arti di Urbino and students of MA course of Visual design |
| FrameTrail icon font | `src/_shared/fonts/FrameTrail_Icons/frametrail-icons.woff2` | SIL Open Font License, Version 1.1 (see below) | see below |

### FrameTrail icon font

The icon font was assembled with IcoMoon from the sources below. Most of its glyphs come from fonts under the SIL Open Font License, built with Fontello. Since it is a modified version of those fonts, the icon font as a whole is distributed under the SIL Open Font License as well. Glyphs taken from Apache-2.0, MIT and CC0 icon sets keep their notices here.

| Source | Glyphs | License | Copyright |
|---|---|---|---|
| Font Awesome 4, via Fontello | 362 | SIL Open Font License 1.1 | Copyright (C) 2016 by Dave Gandy |
| Entypo, via Fontello | 36 or more | SIL Open Font License 1.1 | Copyright (C) 2012 by Daniel Bruce |
| Elusive Icons, via Fontello | 29 or more | SIL Open Font License 1.1 | Copyright (C) 2013 by Aristeides Stathopoulos |
| Typicons, via Fontello | 6 or more | SIL Open Font License 1.1 | (c) Stephen Hutchings 2012 |
| MFG Labs iconset, via Fontello | 2 or more | SIL Open Font License 1.1 | MFG Labs |
| Iconic, Modern Pictograms, Web Symbols and Brandico, via Fontello | possibly some of the 108 glyphs whose names occur in several of the Fontello sets listed here | SIL Open Font License 1.1 | Copyright (C) 2012 by P.J. Onori; Copyright (c) 2012 by John Caserta; Copyright (c) 2011 by Just Be Nice studio; (C) 2012 by Vitaly Puzrin |
| IBM Carbon Design System icons (`@carbon/icons`) | 110 | Apache License 2.0 | Copyright 2015 IBM Corp. |
| Bootstrap Icons | 7 | MIT | Copyright (c) 2019-2024 The Bootstrap Authors |
| Simple Icons (Bluesky logo) | 1 | CC0 1.0 (public domain dedication) | — |
| FrameTrail's own icons (`hypervideo`, `hypervideo-add`, `hypervideo-fork`, `overview`, `overlays`, `annotations`, `videolinks`, `captions-on`, `captions-off`) | 9 | SIL Open Font License 1.1, as part of the font | FrameTrail contributors |

Entypo, Typicons and the MFG Labs iconset also publish their pictograms under CC BY-SA. The fonts that Fontello builds from, and that this font derives from, are under the SIL Open Font License. The Bluesky logo is a trademark of Bluesky Social PBC.

## License texts

### MIT License

Applies to the CodeMirror 6 packages, CollisionDetection, fflate, interact.js, SortableJS and the Bootstrap Icons in the FrameTrail icon font. Each one's copyright line is given above.

```
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

### BSD 2-Clause License

Applies to Leaflet.

```
BSD 2-Clause License

Copyright (c) 2010-2023, Volodymyr Agafonkin
Copyright (c) 2010-2011, CloudMade
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

### BSD 3-Clause License

Applies to Quill.

```
Copyright (c) 2017-2024, Slab
Copyright (c) 2014, Jason Chen
Copyright (c) 2013, salesforce.com
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions
are met:

1. Redistributions of source code must retain the above copyright
   notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright
   notice, this list of conditions and the following disclaimer in the
   documentation and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS
IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED
TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A
PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

### SIL Open Font License, Version 1.1

Applies to Titillium Web and to the FrameTrail icon font with its Fontello sources. Their copyright lines are given above.

```
-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded, 
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```

### Apache License, Version 2.0

Applies to the code ported from HyperFrames and OpenGraph, to hls.js and vtt.js, and to the IBM Carbon icons in the FrameTrail icon font.

```
                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to the Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by the Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding any notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   Copyright 2026 HeyGen, Inc.

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
```
