import type { OutreachLanguage } from "./types";

export type TranslationRequest = {
  text: string;
  sourceLanguage: OutreachLanguage;
  targetLanguage: OutreachLanguage;
};

export interface TranslationProvider {
  name: string;
  detectLanguage(text: string): OutreachLanguage;
  translate(request: TranslationRequest): Promise<string>;
}

const englishToTarget: Record<Exclude<OutreachLanguage, "english">, Record<string, string>> = {
  thai: {
    Hi: "สวัสดี",
    Hello: "สวัสดี",
    "Thank you": "ขอบคุณค่ะ",
    "Thank you.": "ขอบคุณค่ะ",
    "Could you please": "รบกวน",
    "Could you please share your rate card for this project?":
      "รบกวนส่งเรทราคาสำหรับโปรเจกต์นี้ได้ไหมคะ",
    "Could you please provide pricing for": "รบกวนแจ้งราคาสำหรับ",
    "Could you please confirm": "รบกวนยืนยัน",
    "Could you please send": "รบกวนส่ง",
    "Please send": "รบกวนส่ง",
    "We are reaching out for": "เราติดต่อมาในนามของ",
    "We would like to share this campaign with you.": "เราอยากแชร์แคมเปญนี้ให้คุณพิจารณาค่ะ",
    "We would like to confirm the following brief for": "เราขอยืนยันบรีฟสำหรับ",
    "We will review and come back with next steps.": "เราจะตรวจสอบและแจ้งขั้นตอนถัดไปให้ทราบค่ะ",
    "Would you be interested in reviewing the details?": "คุณสนใจดูรายละเอียดเพิ่มเติมไหมคะ",
    "Just following up": "ขอติดตามเรื่อง",
    "Is there room to adjust the rate?": "สามารถปรับราคาได้ไหมคะ",
    "our current budget is a bit lower.": "งบประมาณของเราตอนนี้ค่อนข้างต่ำกว่านี้ค่ะ",
    Project: "โปรเจกต์",
    Campaign: "แคมเปญ",
    Deliverables: "งานที่ต้องส่ง",
    "Talking Points": "ประเด็นที่ต้องสื่อสาร",
    "Usage Rights": "สิทธิ์การใช้งาน",
    "Payment Terms": "เงื่อนไขการชำระเงิน",
    Brief: "บรีฟ",
    Rate: "เรทราคา",
    Pricing: "ราคา",
    "live link": "ลิงก์โพสต์",
    "draft submission": "การส่งดราฟต์",
    posting: "การโพสต์",
  },
  vietnamese: {
    Hi: "Xin chào",
    Hello: "Xin chào",
    "Thank you": "Cảm ơn bạn",
    "Thank you.": "Cảm ơn bạn.",
    "Could you please": "Bạn vui lòng",
    "Could you please share your rate card for this project?":
      "Bạn vui lòng chia sẻ bảng giá cho dự án này được không?",
    "Could you please provide pricing for": "Bạn vui lòng gửi giá cho",
    "Could you please confirm": "Bạn vui lòng xác nhận",
    "Could you please send": "Bạn vui lòng gửi",
    "Please send": "Bạn vui lòng gửi",
    "We are reaching out for": "Chúng mình liên hệ thay mặt",
    "We would like to share this campaign with you.":
      "Chúng mình muốn chia sẻ chiến dịch này để bạn xem qua.",
    "We would like to confirm the following brief for": "Chúng mình muốn xác nhận brief sau cho",
    "We will review and come back with next steps.":
      "Chúng mình sẽ xem lại và phản hồi các bước tiếp theo.",
    "Would you be interested in reviewing the details?":
      "Bạn có muốn xem thêm thông tin chi tiết không?",
    "Just following up": "Mình xin phép theo dõi thêm",
    "Is there room to adjust the rate?": "Bạn có thể điều chỉnh mức giá được không?",
    "our current budget is a bit lower.": "ngân sách hiện tại của chúng mình thấp hơn một chút.",
    Project: "Dự án",
    Campaign: "Chiến dịch",
    Deliverables: "Hạng mục cần thực hiện",
    "Talking Points": "Điểm cần truyền tải",
    "Usage Rights": "Quyền sử dụng",
    "Payment Terms": "Điều khoản thanh toán",
    Brief: "Brief",
    Rate: "Bảng giá",
    Pricing: "Giá",
    "live link": "link live",
    "draft submission": "gửi draft",
    posting: "đăng bài",
  },
  filipino: {
    Hi: "Hi",
    Hello: "Hello",
    "Thank you": "Salamat",
    "Thank you.": "Salamat.",
    "Could you please": "Pwede mo bang",
    "Could you please share your rate card for this project?":
      "Pwede mo bang i-share ang rate card mo para sa project na ito?",
    "Could you please provide pricing for": "Pwede mo bang ibigay ang presyo para sa",
    "Could you please confirm": "Pwede mo bang i-confirm",
    "Could you please send": "Pwede mo bang ipadala",
    "Please send": "Pakisend",
    "We are reaching out for": "Nakikipag-ugnayan kami para sa",
    "We would like to share this campaign with you.":
      "Gusto naming i-share ang campaign na ito sa iyo.",
    "We would like to confirm the following brief for":
      "Gusto naming i-confirm ang brief na ito para sa",
    "We will review and come back with next steps.":
      "Ire-review namin ito at babalikan ka namin sa next steps.",
    "Would you be interested in reviewing the details?": "Interesado ka bang tingnan ang details?",
    "Just following up": "Magfo-follow up lang kami",
    "Is there room to adjust the rate?": "May room ba to adjust the rate?",
    "our current budget is a bit lower.": "medyo mas mababa ang current budget namin.",
    Project: "Project",
    Campaign: "Campaign",
    Deliverables: "Deliverables",
    "Talking Points": "Talking Points",
    "Usage Rights": "Usage Rights",
    "Payment Terms": "Payment Terms",
    Brief: "Brief",
    Rate: "Rate",
    Pricing: "Pricing",
    "live link": "live link",
    "draft submission": "draft submission",
    posting: "posting",
  },
  spanish: {
    Hi: "Hola",
    Hello: "Hola",
    "Thank you": "Gracias",
    "Thank you.": "Gracias.",
    "Could you please": "Podrías",
    "Could you please share your rate card for this project?":
      "Podrías compartir tu tarifario para este proyecto?",
    "Could you please provide pricing for": "Podrías compartir el precio para",
    "Could you please confirm": "Podrías confirmar",
    "Could you please send": "Podrías enviar",
    "Please send": "Por favor envía",
    "We are reaching out for": "Te contactamos en nombre de",
    "We would like to share this campaign with you.":
      "Nos gustaría compartir esta campaña contigo.",
    "We would like to confirm the following brief for":
      "Nos gustaría confirmar el siguiente brief para",
    "We will review and come back with next steps.":
      "Lo revisaremos y te responderemos con los siguientes pasos.",
    "Would you be interested in reviewing the details?": "Te interesaría revisar los detalles?",
    "Just following up": "Quería dar seguimiento",
    "Is there room to adjust the rate?": "Hay posibilidad de ajustar la tarifa?",
    "our current budget is a bit lower.": "nuestro presupuesto actual es un poco más bajo.",
    Project: "Proyecto",
    Campaign: "Campaña",
    Deliverables: "Entregables",
    "Talking Points": "Puntos clave",
    "Usage Rights": "Derechos de uso",
    "Payment Terms": "Condiciones de pago",
    Brief: "Brief",
    Rate: "Tarifa",
    Pricing: "Precio",
    "live link": "enlace en vivo",
    "draft submission": "envío del borrador",
    posting: "publicación",
  },
};

class LocalTranslationProvider implements TranslationProvider {
  name = "LocalTranslationProvider";

  detectLanguage(text: string): OutreachLanguage {
    const value = text.trim().toLowerCase();
    if (!value) return "english";
    if (/[\u0E00-\u0E7F]/.test(value)) return "thai";
    if (/[ăâêôơưđàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i.test(value)) {
      return "vietnamese";
    }
    if (
      /[ñ¿¡áéíóúü]/i.test(value) ||
      containsAny(value, [" gracias", " hola", " tarifa", " precio"])
    ) {
      return "spanish";
    }
    if (containsAny(value, [" salamat", " pwede", " kumusta", " rate card", " mag", " pakisend"])) {
      return "filipino";
    }
    return "english";
  }

  async translate({ text, sourceLanguage, targetLanguage }: TranslationRequest): Promise<string> {
    if (!text.trim() || sourceLanguage === targetLanguage) return text;

    const bridgedText =
      sourceLanguage === "english"
        ? text
        : replacePhrases(text, reverseDictionary(englishToTarget[sourceLanguage]));

    if (targetLanguage === "english") return bridgedText;
    return replacePhrases(bridgedText, englishToTarget[targetLanguage]);
  }
}

const translationProvider = new LocalTranslationProvider();

export function detectLanguage(text: string): OutreachLanguage {
  return translationProvider.detectLanguage(text);
}

export async function translateText(request: TranslationRequest): Promise<string> {
  return translationProvider.translate(request);
}

export function getLanguageLabel(language: OutreachLanguage): string {
  const labels: Record<OutreachLanguage, string> = {
    english: "English",
    thai: "Thai",
    vietnamese: "Vietnamese",
    filipino: "Filipino",
    spanish: "Spanish",
  };
  return labels[language];
}

function containsAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function reverseDictionary(dictionary: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(dictionary).map(([english, target]) => [target, english]),
  );
}

function replacePhrases(text: string, dictionary: Record<string, string>): string {
  return Object.entries(dictionary)
    .sort(([first], [second]) => second.length - first.length)
    .reduce((current, [source, target]) => {
      return current.replace(new RegExp(escapeRegExp(source), "gi"), target);
    }, text);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
