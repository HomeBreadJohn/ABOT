import type { AnalysisTranslation } from "@/contracts";

import { MOCK_ANALYSIS_IDS } from "./ids";

/**
 * Translation overlay for the employment contract (Filipino). Overlay keys
 * are finding/section ids from the original report. Evidence excerpts are
 * never translated. Wording should be reviewed by a native speaker.
 */
export const employmentContractFilipino: AnalysisTranslation = {
  analysisId: MOCK_ANALYSIS_IDS.employmentContract,
  language: "fil",
  overview:
    "Ito ay probationary na kontrata sa trabaho bilang Customer Support Associate. Nakasaad dito ang sahod, anim na buwang probation, at mga patakaran sa pag-alis sa trabaho. Dalawang bahagi ang dapat bigyang-pansin: ang dalawang taong non-compete at ang parusa kapag nag-resign nang walang 30 araw na abiso.",
  explanation:
    "Sa pagpirma mo, sumasang-ayon kang magtrabaho sa kumpanya bilang Customer Support Associate sa sahod na PHP 18,500 kada buwan. Probationary ka sa unang anim na buwan. Maaaring tapusin ng alinmang panig ang kontrata sa pamamagitan ng 30 araw na nakasulat na abiso, at maaaring may bayaran kang isang buwang sahod kung aalis ka nang walang abiso. Pagkatapos mong umalis, sumasang-ayon kang hindi magtatrabaho sa kakumpitensya sa loob ng dalawang taon.",
  items: {
    "wo-1": {
      title: "Dalawang taong non-compete clause",
      explanation:
        "Nililimitahan nito kung saan ka maaaring magtrabaho pagkatapos mong umalis. Mahaba ang dalawang taon para sa support role, kaya mabuting itanong ito.",
    },
    "wo-2": {
      title: "Parusa kapag umalis nang walang abiso",
      explanation:
        "Kung hindi ka magbibigay ng 30 araw na nakasulat na abiso, maaaring kailangan mong magbayad ng isang buwang sahod sa kumpanya.",
    },
    "wo-3": {
      title: "Hindi nakasaad ang oras ng trabaho",
      explanation:
        "Kung walang nakasulat na iskedyul, hindi mo malalaman ang inaasahang oras, shift, o araw ng pahinga.",
    },
    "co-1": {
      title: "Maaaring may bayaran kang isang buwang sahod",
      explanation:
        "Nakasaad sa kontrata na magbabayad ka ng halagang katumbas ng isang buwang sahod kung mag-resign ka nang walang kinakailangang abiso.",
    },
    "co-2": {
      title: "Maaaring kumilos ang kumpanya kung sasama ka sa kakumpitensya",
      explanation:
        "Hindi sinasabi ng kontrata kung ano ang mangyayari kapag nilabag ang non-compete. Makatwirang asahan na maaaring tumutol ang kumpanya, pero ito ay aming interpretasyon at hindi nakasaad sa dokumento.",
    },
    "ns-1": {
      title: "Hingin sa HR ang iskedyul ng trabaho nang nakasulat",
      explanation:
        "Humingi ng nakasulat na araw ng trabaho, oras, at araw ng pahinga bago ka pumirma.",
    },
  },
};
