export default {
  async fetch(request, env, ctx) {
    // Telegram ကနေ လှမ်းခေါ်တဲ့ Request ဖြစ်မဖြစ် စစ်မယ်
    if (request.method === "POST") {
      try {
        const update = await request.json();
        
        if (update.message && update.message.text) {
          const chatId = update.message.chat.id;
          const text = update.message.text.trim();
          
          // /start command အတွက်
          if (text === "/start") {
            await sendMessage(env.BOT_TOKEN, chatId, "⚡ <b>ZHOST Bot</b> မှ ကြိုဆိုပါတယ်!\n\nTikTok လင့်ခ်တစ်ခု ပို့ပေးလိုက်ပါ။ View ပို့ပေးပါမယ်။\n\n❤️ <b>Like ပို့ချင်ရင်:</b>\n<code>/like https://vm.tiktok.com/...</code>\n\n👁️ <b>View ပို့ချင်ရင်:</b>\n<code>/view https://vm.tiktok.com/...</code>");
            return new Response("OK");
          }

          // /view သို့မဟုတ် /like command ဖြစ်မဖြစ် စစ်မယ်
          let type = null;
          let url = "";

          if (text.startsWith("/view ")) {
            type = "views";
            url = text.replace("/view ", "").trim();
          } else if (text.startsWith("/like ")) {
            type = "likes";
            url = text.replace("/like ", "").trim();
          }

          // Command မှန်ကန်ရင် လုပ်ဆောင်မယ်
          if (type && url) {
            await sendMessage(env.BOT_TOKEN, chatId, "⏳ ပို့နေသည်... ခဏစောင့်ပါ။");

            const result = await processLeofame(type, url);

            if (result.success) {
              await sendMessage(env.BOT_TOKEN, chatId, `✅ <b>အောင်မြင်ပါသည်!</b>\n${result.message}`);
            } else {
              await sendMessage(env.BOT_TOKEN, chatId, `❌ <b>မအောင်မြင်ပါ:</b>\n${result.message}`);
            }
          } else {
            if (text.startsWith("http")) {
               await sendMessage(env.BOT_TOKEN, chatId, "⚠️ ကျေးဇူးပြု၍ <code>/view</code> သို့မဟုတ် <code>/like</code> ကို ရှေ့ကထည့်ပြီး ပို့ပါ။\nဥပမာ - <code>/view " + text + "</code>");
            } else {
               await sendMessage(env.BOT_TOKEN, chatId, "⚠️ မသိသော Command ဖြစ်ပါသည်။ /start ကို နှိပ်ပါ။");
            }
          }
        }
        return new Response("OK");
      } catch (e) {
        return new Response("Error: " + e.message, { status: 500 });
      }
    }
    return new Response("ZHOST Bot is running!", { status: 200 });
  }
};

// Telegram ဆီ စာပို့တဲ့ Function
async function sendMessage(token, chatId, text) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: "HTML"
    })
  });
}

// Leofame ဆီ Request ပို့တဲ့ Function
async function processLeofame(type, tiktokUrl) {
  const baseUrl = `https://leofame.com/free-tiktok-${type}`;
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": baseUrl,
    "Origin": "https://leofame.com",
    "X-Requested-With": "XMLHttpRequest"
  };

  try {
    const getRes = await fetch(baseUrl, { headers });
    const html = await getRes.text();
    const tokenMatch = html.match(/name="token"\s+value="([^"]+)"/);
    
    if (!tokenMatch) throw new Error("Token ရှာမတွေ့ပါ။");
    const token = tokenMatch[1];

    const formData = new URLSearchParams();
    formData.append("token", token);
    formData.append("timezone_offset", "Asia/Yangon");
    formData.append("timezone_offset_2", "1234");
    formData.append("free_link", tiktokUrl);

    const postRes = await fetch(baseUrl + "?api=1", {
      method: "POST",
      headers,
      body: formData.toString()
    });

    const result = await postRes.text();
    
    try {
      const json = JSON.parse(result);
      if (json.success) return { success: true, message: json.success };
      if (json.error) return { success: false, message: json.error };
      if (result.trim() === "") return { success: true, message: "ဆာဗာမှ လက်ခံပြီးပါပြီ။" };
    } catch (e) {}

    return { success: false, message: "မသိသော တုံ့ပြန်မှု (Status: " + postRes.status + ")" };
  } catch (error) {
    return { success: false, message: error.message };
  }
      }
