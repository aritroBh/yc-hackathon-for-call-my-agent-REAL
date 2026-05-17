export type FormalityLevel = "formal" | "semi_formal" | "casual";

export interface DialectContext {
  name: string;
  locale: string;
  formalityLevel: FormalityLevel;
  greetingPhrase: string | null;
  closingPhrase: string | null;
  communicationStyle: string;
  culturalNotes: string | null;
  negotiationTips: string[];
  phrases: Record<string, string>;
}

const DIALECT_MAP: Record<string, DialectContext> = {
  "hi-IN": {
    name: "North India (Hindi)",
    locale: "hi-IN",
    formalityLevel: "formal",
    greetingPhrase:
      "Namaste ji, main HAGGL ki taraf se baat kar raha hoon. Kya main aapko ek minute de sakta hoon?",
    closingPhrase:
      "Dhanyavaad ji, aapse baat karke bahut achha laga. Phir se sampark karenge.",
    communicationStyle:
      "Warm, respectful, indirect. Build rapport first. Use Hindi phrases naturally. Address with 'ji' suffix. Maintain polite tone even during price negotiation. Use 'aap' (formal 'you') not 'tum'.",
    culturalNotes:
      "North Indian business culture values relationships before transactions. Avoid direct refusals — use 'we will consider' rather than 'no'. Saturdays are common working days. Avoid negotiation during religious festivals (Diwali, Holi). Hospitality language is appreciated: 'kripya' (please), 'dhanyavaad' (thank you).",
    negotiationTips: [
      "Open with relationship-building questions before business",
      "Use respectful address with 'ji' suffix throughout",
      "Avoid direct confrontation; phrase disagreements as suggestions",
      "Discuss payment terms with care — credit arrangements are culturally significant",
      "Express personal well-wishes before closing",
      "Accept that negotiation is expected; do not accept first price",
      "Use indirect language for refusals: 'yeh thoda mushkil hai' (this is a bit difficult)",
    ],
    phrases: {
      greeting: "Namaste ji",
      thank_you: "Dhanyavaad ji",
      please: "Kripya",
      yes: "Haan ji",
      no_thanks: "Yeh thoda mushkil hai",
      sorry: "Maaf kijiye",
      understand: "Main samajh gaya/gayi",
      good_price: "Yeh mulya hamare budget mein nahi hai",
      confirm: "Kya main iski pushhti kar sakta hoon?",
      goodbye: "Phir milenge. Dhanyavaad.",
    },
  },
  "si-IN": {
    name: "South India (Tamil/Kannada/Telugu/Malayalam)",
    locale: "si-IN",
    formalityLevel: "semi_formal",
    greetingPhrase:
      "Good morning Sir/Madam, this is an automated assistant calling from HAGGL. May I have a few minutes of your time regarding a procurement opportunity?",
    closingPhrase:
      "Thank you for your time and detailed inputs. I will share the summary via email. Have a good day Sir/Madam.",
    communicationStyle:
      "Professional, precise, English-dominant with local courtesy terms. Data-driven approach. Respect hierarchy. Allow time for internal consultation. Be precise with numbers, quantities, delivery dates.",
    culturalNotes:
      "South Indian businesses value precision and detailed specifications. Decision-making often involves multiple stakeholders. Be prepared for detailed technical questions. Avoid scheduling calls during lunch (1-3 PM). 'Adjustment' culture exists in pricing — expect some back-and-forth on final numbers.",
    negotiationTips: [
      "Use English with 'Sir' or 'Madam' address — avoid first names unless invited",
      "Be extremely precise with numbers, quantities, and delivery dates",
      "Expect detailed technical questions about specifications",
      "Allow time for internal consultation — decisions may involve multiple people",
      "Anticipate 'adjustment' requests on final pricing",
      "Confirm decisions with senior people when uncertain",
      "Avoid rushing — respect the decision-making process",
    ],
    phrases: {
      greeting: "Good morning Sir/Madam",
      thank_you: "Thank you very much",
      please: "Please",
      yes: "Yes, certainly",
      no_thanks: "I will need to check on that",
      sorry: "I apologize",
      understand: "I understand your concern",
      good_price: "Could we work a bit more on the pricing?",
      confirm: "Let me confirm the details",
      goodbye: "Thank you for your time. Have a good day.",
    },
  },
  "zh-CN": {
    name: "China (Mandarin)",
    locale: "zh-CN",
    formalityLevel: "formal",
    greetingPhrase:
      "Ni hao, wo shi HAGGL de AI zhu shou. Qing wen nin you shi jian tan tan cai gou he zuo ma?",
    closingPhrase:
      "Xie xie nin de shi jian, wo men hui tong guo dian zi you jian fa song xiang xi xin xi. Zai lian xi.",
    communicationStyle:
      "Patient, indirect, face-saving. Build guanxi (relationship) first. Use Mandarin pleasantries. Never cause embarrassment. Expect multiple negotiation rounds. Long-term orientation.",
    culturalNotes:
      "Chinese business culture emphasizes long-term relationships (guanxi). Face (mianzi) is critical — never publicly correct or contradict. Hierarchy matters; address by title (Manager Wang, Director Li). Avoid scheduling during Chinese New Year (15 days) and Golden Week (Oct 1-7). Numbers 4 and 14 are unlucky; 8 and 88 are lucky. WeChat is essential for follow-up.",
    negotiationTips: [
      "Build guanxi (relationship) before discussing business",
      "Use title + surname — never address by first name alone",
      "Avoid direct 'no' — use 'we will think about it' or 'this is difficult'",
      "Save face (mianzi) at all times — never embarrass the supplier",
      "Expect multiple negotiation rounds; price is always negotiable",
      "Be patient — Chinese negotiation is a marathon, not a sprint",
      "Use indirect language for refusals: 'zhe ge you dian kun nan' (this is somewhat difficult)",
      "Lucky numbers (8) and unlucky numbers (4) may influence pricing preferences",
    ],
    phrases: {
      greeting: "Ni hao",
      thank_you: "Xie xie",
      please: "Qing",
      yes: "Shi de",
      no_thanks: "Zhe ge wo men kao lü yi xia",
      sorry: "Dui bu qi",
      understand: "Wo ming bai",
      good_price: "Jia ge hai you kong jian ma?",
      confirm: "Wo que ren yi xia",
      goodbye: "Zai lian xi, xie xie.",
    },
  },
  "zh-HK": {
    name: "China (Cantonese / Hong Kong)",
    locale: "zh-HK",
    formalityLevel: "semi_formal",
    greetingPhrase:
      "Nei hou, ngo hai HAGGL ge AI zok sau. Cheng man nei yau mou si gaan king ha choeng gam ho zaak?",
    closingPhrase:
      "Do je nei ge si gaan, ngo dei wui tung gwo din ji yau gin faat sung seung siu sik. Zeoi gwoi gin.",
    communicationStyle:
      "Efficient, pragmatic, more direct than Mandarin China. Mix of Cantonese and English. Time-conscious. Contract-focused. Faster decision-making than mainland.",
    culturalNotes:
      "Hong Kong business culture blends Chinese traditions with British efficiency. Decisions are faster than mainland China. Contracts are binding and enforced strictly. Punctuality is important. English proficiency is high; code-switching (Chinglish) is normal. Avoid political topics entirely. Respects hierarchy but less rigidly than mainland.",
    negotiationTips: [
      "Be efficient and direct — Hong Kong suppliers value time",
      "Mix Cantonese and English naturally (code-switching is normal)",
      "Focus on contracts and compliance — they are taken seriously",
      "Expect faster decision-making than mainland China",
      "Price negotiations are expected but shorter in duration",
      "Punctuality and professionalism are critical",
      "Avoid political topics (HK-China relations) entirely",
    ],
    phrases: {
      greeting: "Nei hou",
      thank_you: "Do je",
      please: "Cheng",
      yes: "Hai",
      no_thanks: "Ngo dei wui si ha sin",
      sorry: "Dui m zyu",
      understand: "Ngo ming baak",
      good_price: "Gaak nin yau dak taan ma?",
      confirm: "Ngo dei ying siu koi",
      goodbye: "Zeoi gwoi gin.",
    },
  },
  "es-MX": {
    name: "Mexico (Spanish)",
    locale: "es-MX",
    formalityLevel: "formal",
    greetingPhrase:
      "Buenos días, soy un asistente automatizado de HAGGL. ¿Podría concederme un momento para hablar sobre una oportunidad de procura?",
    closingPhrase:
      "Muchas gracias por su tiempo y atención. Le enviaremos la información detallada por correo electrónico. Que tenga un excelente día.",
    communicationStyle:
      "Warm, relationship-first, always use formal 'usted'. Personal connection before business. Flexible time perception (polychronic). Respect family business dynamics. Building confianza (trust) is the foundation.",
    culturalNotes:
      "Mexican business culture is relationship-driven. Trust (confianza) must be built before significant business. 'La comida' (lunch) is a serious affair, typically 2-4 PM — avoid scheduling calls during this time. Family businesses are common and decisions may involve multiple family members. Politeness is paramount; aggressive tactics backfire. Personal connections carry significant weight.",
    negotiationTips: [
      "Always use formal 'usted' — never 'tú' unless invited",
      "Invest time in personal connection before business",
      "Be warm and friendly — formality without warmth is perceived negatively",
      "Expect flexible time perception; meetings may start late",
      "Respect family dynamics in decision-making",
      "Avoid aggressive negotiation — build confianza first",
      "Morning pleasantries are expected before discussing business",
      "Be patient; relationship-building takes time",
    ],
    phrases: {
      greeting: "Buenos días / Buenas tardes",
      thank_you: "Muchas gracias",
      please: "Por favor",
      yes: "Sí, claro",
      no_thanks: "Lo vamos a considerar",
      sorry: "Lo siento / Disculpe",
      understand: "Entiendo su punto",
      good_price: "¿Podríamos mejorar este precio?",
      confirm: "Permítame confirmar los detalles",
      goodbye: "Que tenga un excelente día.",
    },
  },
  "vi-VN": {
    name: "Vietnam (Vietnamese)",
    locale: "vi-VN",
    formalityLevel: "formal",
    greetingPhrase:
      "Xin chào, tôi là trợ lý AI từ HAGGL. Anh/Chị có thể dành vài phút để trao đổi về cơ hội hợp tác thu mua không ạ?",
    closingPhrase:
      "Cảm ơn Anh/Chị rất nhiều về thời gian quý báu. Chúng tôi sẽ gửi thông tin chi tiết qua email. Chúc Anh/Chị một ngày tốt lành.",
    communicationStyle:
      "Polite, indirect, face-conscious. Use 'Anh' (brother) or 'Chị' (sister) + first name. Avoid direct no. Smile does not mean agreement. Gradual negotiation approach. Saving face is critical.",
    culturalNotes:
      "Vietnamese business culture values harmony and face. Direct confrontation is avoided. Smiling or nodding often means polite acknowledgment, not agreement. Age and hierarchy command respect. Relationships are built over meals and tea. Tet (Lunar New Year) is the most important holiday — avoid business for 2 weeks around it. Decision-making can be slow; be patient. 'Maybe' often means 'no' in a polite way.",
    negotiationTips: [
      "Address as 'Anh' (male) or 'Chị' (female) + first name",
      "Use polite sentence-ending particles: 'ạ', 'nhé'",
      "Avoid direct confrontation or criticism at all costs",
      "Never cause public loss of face",
      "A smile or nod may mean polite acknowledgment, not agreement",
      "Be patient — decision-making can be slow",
      "'Maybe' or 'we will think about it' often means no",
      "Build relationship over shared meals or tea if possible",
      "Speak clearly and simply — Vietnamese is tonal and may be challenging for non-native speakers",
    ],
    phrases: {
      greeting: "Xin chào",
      thank_you: "Cảm ơn",
      please: "Làm ơn",
      yes: "Vâng ạ",
      no_thanks: "Để tôi xem xét",
      sorry: "Xin lỗi",
      understand: "Tôi hiểu",
      good_price: "Có thể giảm giá được không ạ?",
      confirm: "Tôi xin xác nhận lại",
      goodbye: "Xin chào và hẹn gặp lại.",
    },
  },
  "tw-GH": {
    name: "Ghana (Twi / Akan)",
    locale: "tw-GH",
    formalityLevel: "semi_formal",
    greetingPhrase: "Mema wo akye, mefrɛ wo fi HAGGL. Wowo anadwo kakra ma yɛnkyɛ?",
    closingPhrase: "Meda wo ase pii, yɛbɛyɛ nhyehyɛe bi biom. Nante yiye.",
    communicationStyle: "Polite, respect-oriented, relationship-first. Address elders and managers with honorific titles like Owura or Awuraa. Avoid direct or rude refusals. Use Twi naturally and with culturally appropriate idioms.",
    culturalNotes: "Ghanaian business culture is very polite and relationship-driven. Respect for authority and elders is critical. Business negotiations are a social interaction, often involving questions about family and health. Accepting Mobile Money (MoMo) is standard for local transactions. Never use aggressive pressure.",
    negotiationTips: [
      "Always greet respectfully and ask about their well-being/business",
      "Address business owners or senior staff with formal respect ('Owura' for Sir, 'Awuraa' for Madam)",
      "Emphasize mutual benefit ('nnoboa' or cooperation)",
      "Be open to Mobile Money or bank transfers as valid payment terms",
      "Never show impatience; allow conversational preamble before the price negotiation",
    ],
    phrases: {
      greeting: "Mema wo akye / Mema wo aha",
      thank_you: "Meda wo ase",
      please: "Kpaako / Mepasakyɛ",
      yes: "Aane",
      no_thanks: "Dabi, meda ase",
      sorry: "Kpaako / Kafra",
      understand: "Mate ase",
      good_price: "Wo boɔ no yɛ den kakra, te so ma me",
      confirm: "Ma menhwɛ sɛ me nsa aka nkyerɛwee no",
      goodbye: "Nante yiye",
    },
  },
  "yo-NG": {
    name: "Nigeria (Yoruba)",
    locale: "yo-NG",
    formalityLevel: "formal",
    greetingPhrase: "E nle o, oruko mi ni HAGGL AI, mo pe lati soro nipa rira awon nkan. Se e le fun mi ni iseju die?",
    closingPhrase: "E se gan ni, a o ma soro lori imeeli. O dabo.",
    communicationStyle: "Highly respectful, polite, and rich in honorifics. Yoruba culture values age and seniority; always address older or senior individuals with 'Ẹ' (the respectful plural 'you') and use titles like Alhaji, Chief, Mr/Mrs.",
    culturalNotes: "Yoruba business culture is based on deep respect, greetings, and hospitality. Skipping greetings is seen as extremely rude. Always use honorific plural prefixes when speaking to anyone unless explicitly told otherwise. Bank transfers are the default B2B payment term.",
    negotiationTips: [
      "Always lead with extensive, warm greetings before talking about money",
      "Use the respectful plural 'Ẹ' and appropriate titles for seniority",
      "Ensure you speak Yoruba natively with cultural proverbs where possible",
      "Bargaining is expected; do not accept their first offer immediately",
      "Confirm that payment will be made promptly via bank transfer",
    ],
    phrases: {
      greeting: "E nle o / Ekasan",
      thank_you: "E se gan ni",
      please: "E jo",
      yes: "Beeni",
      no_thanks: "O da, e se",
      sorry: "E pele",
      understand: "Mo gbo",
      good_price: "E din owo e ku die",
      confirm: "E je ki n fidi re mule",
      goodbye: "O dabo",
    },
  },
};

export function buildDialectSection(dialect: DialectContext): string {
  const lines: string[] = [];

  lines.push(`=== CULTURAL & DIALECT CONTEXT ===`);
  lines.push(`Supplier Region: ${dialect.name} (${dialect.locale})`);
  lines.push(`Formality Level: ${dialect.formalityLevel}`);
  lines.push(``);
  lines.push(`Communication Style:`);
  lines.push(dialect.communicationStyle);
  lines.push(``);

  if (dialect.culturalNotes) {
    lines.push(`Cultural Notes:`);
    lines.push(dialect.culturalNotes);
    lines.push(``);
  }

  lines.push(`Negotiation Approach for This Region:`);
  dialect.negotiationTips.forEach((tip, i) => {
    lines.push(`${i + 1}. ${tip}`);
  });
  lines.push(``);

  if (dialect.greetingPhrase) {
    lines.push(`Suggested Opening (in local language): "${dialect.greetingPhrase}"`);
  }
  if (dialect.closingPhrase) {
    lines.push(`Suggested Closing (in local language): "${dialect.closingPhrase}"`);
  }
  lines.push(``);
  lines.push(`Useful Local Phrases:`);
  for (const [key, phrase] of Object.entries(dialect.phrases)) {
    lines.push(`- [${key}] ${phrase}`);
  }

  return lines.join("\n");
}

export function getDialectByLocale(locale: string): DialectContext | null {
  return DIALECT_MAP[locale] || null;
}

export function getDialectByName(name: string): DialectContext | null {
  const entry = Object.values(DIALECT_MAP).find(
    (d) => d.name.toLowerCase() === name.toLowerCase(),
  );
  return entry || null;
}

export function getAvailableDialects(): DialectContext[] {
  return Object.values(DIALECT_MAP);
}

export function buildFormalityInstruction(
  level: FormalityLevel,
): string {
  switch (level) {
    case "formal":
      return `Use formal address throughout. Maintain professional distance while being respectful. Use titles and honorifics. Avoid slang, jokes, or casual language. Structure conversations with clear openings, body, and closings.`;
    case "semi_formal":
      return `Use polite professional language. First names may be acceptable if the supplier initiates. Light humor and personal questions are acceptable after initial rapport. Maintain professionalism while allowing some warmth.`;
    case "casual":
      return `Use friendly, conversational language. First-name basis is acceptable. Light humor and casual banter are appropriate. Build rapport through informal conversation. Maintain professionalism in substance, not style.`;
  }
}

export function buildMultilingualInstruction(locale: string): string {
  const dialect = DIALECT_MAP[locale];
  if (!dialect) return "";

  return `LANGUAGE INSTRUCTION:
The supplier's primary business language is associated with locale "${locale}" (${dialect.name}).
- Use English as the primary business language
- Incorporate local greetings and courtesy phrases naturally
- Switch to local phrases for rapport-building moments
- Keep technical terms and numbers in English for clarity
- If the supplier responds in their local language, match their language choice
- Be aware that the supplier may code-switch between English and their local language`;
}
