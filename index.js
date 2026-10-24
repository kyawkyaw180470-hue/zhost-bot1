export default {
  async fetch(request, env, ctx) {
    if (request.method === "POST") {
      try {
        const update = await request.json();
        
        // ၁။ Button နှိပ်တဲ့အခါ (Callback Query)
        if (update.callback_query) {
          await handleCallback(update.callback_query, env);
          return new Response("OK");
        }

        // ၂။ စာရိုက်ပို့တဲ့အခါ (Message)
        if (update.message && update.message.text) {
          await handleMessage(update.message, env);
          return new Response("OK");
        }

        return new Response("OK");
      } catch (e) {
        console.error(e);
        return new Response("Error: " + e.message, { status: 500 });
      }
    }
    return new Response("ZHOST Premium Bot is running!", { status: 200 });
  }
};

const CHANNEL_ID = "@ZhostTech";
const BOT_USERNAME = "zhost_tt_bot"; // ⚠️ ဒီနေရာမှာ သင့် Bot ရဲ့ Username ကို ထည့်ပါ

async function sendMessage(token, chatId, text, replyMarkup = null) {
  const payload = { chat_id: chatId, text: text, parse_mode: "HTML" };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
  });
}

async function editMessage(token, chatId, messageId, text, replyMarkup = null) {
  const payload = { chat_id: chatId, message_id: messageId, text: text, parse_mode: "HTML" };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
  });
}

async function answerCallback(token, callbackId, text = "") {
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ callback_query_id: callbackId, text })
  });
}

async function checkJoin(token, userId) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getChatMember?chat_id=${CHANNEL_ID}&user_id=${userId}`);
    const data = await res.json();
    if (data.ok) {
      const status = data.result.status;
      return status === "member" || status === "administrator" || status === "creator";
    }
  } catch (e) {}
  return false;
}

async function handleMessage(message, env) {
  const chatId = message.chat.id.toString();
  const text = message.text.trim();
  const username = message.from.username || message.from.first_name || "သူငယ်ချင်း";

  let user = await env.DB.prepare("SELECT * FROM users WHERE user_id = ?").bind(chatId).first();
  const isNewUser = !user;

  if (isNewUser) {
    let referredBy = null;
    if (text.startsWith("/start ref_")) {
      referredBy = text.replace("/start ref_", "");
    }
    
    // User အသစ်ကို သိမ်းမယ် (refer_rewarded ကို 0 လို့ ထားမယ်)
    await env.DB.prepare("INSERT INTO users (user_id, username, coins, referred_by, refer_rewarded) VALUES (?, ?, 0, ?, 0)")
      .bind(chatId, username, referredBy).run();
    user = { user_id: chatId, coins: 0, referred_by: referredBy, refer_rewarded: 0 };
  }

  const joined = await checkJoin(env.BOT_TOKEN, chatId);
  if (!joined) {
    await sendMessage(env.BOT_TOKEN, chatId, 
      `ဟေး ${username} ရေ... 👋\nအရင်ဆုံး ကျွန်တော်တို့ရဲ့ <b>ZHOST Tech</b> Channel လေးကို Join ပေးပါဦးနော်။\nJoin ပြီးမှ စိတ်ကြိုက် Boost တွေ လုပ်လို့ရမှာပါ။`,
      { inline_keyboard: [
        [{ text: "📢 Join Channel", url: "https://t.me/ZhostTech" }],
        [{ text: "✅ Join ပြီးပါပြီ", callback_data: "check_join" }]
      ]}
    );
    return;
  }

  if (text.startsWith("http")) {
    await processBoost(chatId, username, text, user, env);
    return;
  }

  await showMainMenu(env.BOT_TOKEN, chatId, username, isNewUser);
}

async function handleCallback(query, env) {
  const chatId = query.message.chat.id.toString();
  const messageId = query.message.message_id;
  const data = query.data;
  const username = query.from.username || query.from.first_name || "သူငယ်ချင်း";

  await answerCallback(env.BOT_TOKEN, query.id);

  if (data === "check_join") {
    const joined = await checkJoin(env.BOT_TOKEN, chatId);
    if (joined) {
      // 🎯 Referral Reward Logic (Join ပြီးမှ 4 Coins ပေးမယ်)
      const user = await env.DB.prepare("SELECT * FROM users WHERE user_id = ?").bind(chatId).first();
      if (user.referred_by && user.refer_rewarded === 0) {
        // ဖိတ်ခေါ်တဲ့သူကို 4 Coins ပေါင်းထည့်မယ်
        await env.DB.prepare("UPDATE users SET coins = coins + 4 WHERE user_id = ?").bind(user.referred_by).run();
        // ဒီ User ကို Reward ပေးပြီးသားလို့ မှတ်မယ် (ထပ်မရအောင်)
        await env.DB.prepare("UPDATE users SET refer_rewarded = 1 WHERE user_id = ?").bind(chatId).run();
        
        // ဖိတ်ခေါ်တဲ့သူကို အသိပေးမယ်
        await sendMessage(env.BOT_TOKEN, user.referred_by, `🎉 ဝမ်းသာပါတယ်! သင့်ရဲ့ Link ကနေ သူငယ်ချင်းတစ်ယောက် Channel Join လုပ်သွားပါပြီ။\n<b>4 Coins</b> ချက်ချင်း ရောက်လာပါပြီနော်။`);
      }

      await editMessage(env.BOT_TOKEN, chatId, messageId, `ကျေးဇူးတင်ပါတယ်နော် ${username} ရေ! 🎉\nအခု စိတ်ကြိုက် အသုံးပြုလို့ရပါပြီ။`);
      await showMainMenu(env.BOT_TOKEN, chatId, username);
    } else {
      await sendMessage(env.BOT_TOKEN, chatId, "😅 Channel ကို မ Join ရသေးဘူးနော်။ Join ပြီးမှ ပြန်နှိပ်ကြည့်ပါဦး။");
    }
    return;
  }

  if (data === "main_menu") {
    await editMessage(env.BOT_TOKEN, chatId, messageId, `🏠 <b>ZHOST Main Menu</b>\nဘာလုပ်ချင်လဲ ရွေးလိုက်ပါဦး ${username} ရေ...`);
    await showMainMenu(env.BOT_TOKEN, chatId, username, false, messageId);
    return;
  }

  if (data === "account") {
    const user = await env.DB.prepare("SELECT * FROM users WHERE user_id = ?").bind(chatId).first();
    const refCount = await env.DB.prepare("SELECT COUNT(*) as count FROM users WHERE referred_by = ? AND refer_rewarded = 1").bind(chatId).first();
    
    const text = `👤 <b>Account Info</b>\n\n` +
      `📛 အမည်: ${username}\n` +
      `🆔 ID: <code>${chatId}</code>\n` +
      `💰 လက်ကျန် Coins: <b>${user.coins} Coins</b>\n` +
      `👥 ကိုယ့်ကနေ Refer လုပ်ပြီး Join သွားသူ: <b>${refCount.count} ယောက်</b>\n\n` +
      `💡 <i>Boost 1 ခါလုပ်တိုင်း 1 Coin ကုန်ပါမယ်နော်။</i>`;

    await editMessage(env.BOT_TOKEN, chatId, messageId, text, 
      { inline_keyboard: [[{ text: "🔙 ပင်မစာမျက်နှာ", callback_data: "main_menu" }]] }
    );
    return;
  }

  if (data === "daily") {
    const user = await env.DB.prepare("SELECT * FROM users WHERE user_id = ?").bind(chatId).first();
    const now = Math.floor(Date.now() / 1000);
    const oneDay = 86400;

    if (now - user.last_daily < oneDay) {
      const hoursLeft = Math.ceil((oneDay - (now - user.last_daily)) / 3600);
      await sendMessage(env.BOT_TOKEN, chatId, `⏳ ဒီနေ့အတွက် ယူပြီးသားဖြစ်နေတယ်နော်။ နောက် <b>${hoursLeft} နာရီ</b> လောက်နေမှ ပြန်ယူလို့ရပါမယ်။`);
    } else {
      await env.DB.prepare("UPDATE users SET coins = coins + 2, last_daily = ? WHERE user_id = ?").bind(now, chatId).run();
      await sendMessage(env.BOT_TOKEN, chatId, `🎁 အားပေးတဲ့အတွက် ကျေးဇူးတင်ပါတယ်။ <b>2 Coins</b> ရသွားပါပြီနော်!`);
    }
    return;
  }

  if (data === "referral") {
    const refLink = `https://t.me/${BOT_USERNAME}?start=ref_${chatId}`;
    const text = `👥 <b>Refer & Earn</b>\n\n` +
      `သူငယ်ချင်းတွေကို ဒီ Link လေး Share ပေးလိုက်ပါ။\n` +
      `သူတို့ ဒီ Link ကနေ ဝင်ပြီး <b>Channel Join လုပ်တာနဲ့</b> သင့်ဆီကို <b>4 Coins</b> ချက်ချင်း ရောက်လာပါလိမ့်မယ်။\n\n` +
      `<code>${refLink}</code>`;
      
    await editMessage(env.BOT_TOKEN, chatId, messageId, text, 
      { inline_keyboard: [[{ text: "🔙 ပင်မစာမျက်နှာ", callback_data: "main_menu" }]] }
    );
    return;
  }

  if (data === "boost_now") {
    await editMessage(env.BOT_TOKEN, chatId, messageId, 
      `🚀 <b>Boost လုပ်ရန် အသင့်ပါပဲ!</b>\n\n` +
      `ကျေးဇူးပြုပြီး သင့် TikTok ဗီဒီယိုရဲ့ Link ကို ဒီ Chat ထဲမှာ ပို့ပေးလိုက်ပါ။\n` +
      `(ဥပမာ - <code>https://vm.tiktok.com/...</code>)\n\n` +
      `⚠️ <i>Boost ၁ ခါ လုပ်တိုင်း 1 Coin ကုန်ပါမယ်။</i>`, 
      { inline_keyboard: [[{ text: "🔙 ပင်မစာမျက်နှာ", callback_data: "main_menu" }]] }
    );
    return;
  }
}

async function showMainMenu(token, chatId, username, isNew = false, messageId = null) {
  let greet = isNew ? `မင်္ဂလာပါ ${username} ရေ... 🙌\nZHOST မှ ကြိုဆိုပါတယ်နော်။\n\n` : "";
  const text = greet + `ဘာလုပ်ချင်လဲ ရွေးလိုက်ပါဦး သူငယ်ချင်းရေ... 😊`;
  
  const keyboard = {
    inline_keyboard: [
      [{ text: "🚀 Boost လုပ်မယ်", callback_data: "boost_now" }],
      [{ text: "💳 အကောင့်အချက်အလက်", callback_data: "account" }, { text: "🎁 Daily Reward", callback_data: "daily" }],
      [{ text: "👥 သူငယ်ချင်းခေါ်မယ် (Refer)", callback_data: "referral" }]
    ]
  };

  if (messageId) {
    await editMessage(token, chatId, messageId, text, keyboard);
  } else {
    await sendMessage(token, chatId, text, keyboard);
  }
}

async function processBoost(chatId, username, tiktokUrl, user, env) {
  const now = Math.floor(Date.now() / 1000);

  if (user.coins < 1) {
    await sendMessage(env.BOT_TOKEN, chatId, `😅 သူငယ်ချင်းရေ... မင်းဆီမှာ Coin မရှိတော့ဘူးနော်။\nDaily Reward သွားယူပြီး ပြန်လာခဲ့ပါဦး။`);
    return;
  }

  if (now - user.last_boost_time < 300) {
    const waitMins = Math.ceil((300 - (now - user.last_boost_time)) / 60);
    await sendMessage(env.BOT_TOKEN, chatId, `⏳ ဟိုက်ကွင်း အရမ်းမြန်နေတယ်နော်။ နောက် <b>${waitMins} မိနစ်</b> လောက်နေမှ ထပ်လုပ်လို့ရပါမယ်။`);
    return;
  }

  const previousBoost = await env.DB.prepare("SELECT * FROM boosts WHERE user_id = ? AND link = ?").bind(chatId, tiktokUrl).first();
  if (previousBoost && (now - previousBoost.timestamp < 72000)) {
    const hoursLeft = Math.ceil((72000 - (now - previousBoost.timestamp)) / 3600);
    await sendMessage(env.BOT_TOKEN, chatId, `✋ ဒီ Link ကို Boost လုပ်ပြီးသားဖြစ်နေတယ်နော်။\nနောက် <b>${hoursLeft} နာရီ</b> လောက်နေမှ ပြန်ပြီး Boost လုပ်လို့ရပါမယ်။\nဒါမှမဟုတ် တခြားဗီဒီယိုလင့်ခ် သုံးကြည့်ပါဦး။`);
    return;
  }

  await sendMessage(env.BOT_TOKEN, chatId, `⏳ ခဏလေးနော် ${username} ရေ... မင်းရဲ့ TikTok ကို Boost ပေးနေတယ်။`);
  
  const result = await processLeofame("views", tiktokUrl);

  if (result.success) {
    await env.DB.prepare("UPDATE users SET coins = coins - 1, last_boost_time = ? WHERE user_id = ?").bind(now, chatId).run();
    await env.DB.prepare("INSERT INTO boosts (user_id, link, timestamp) VALUES (?, ?, ?) ON CONFLICT(user_id, link) DO UPDATE SET timestamp = ?").bind(chatId, tiktokUrl, now, now).run();
    
    await sendMessage(env.BOT_TOKEN, chatId, `✅ <b>Boost အောင်မြင်ပါတယ်!</b>\n\n${result.message}\n\n💰 <i>1 Coin နှုတ်လိုက်ပါပြီ။</i>\nအားပေးတဲ့အတွက် ကျေးဇူးတင်ပါတယ်နော်။`, 
      { inline_keyboard: [[{ text: "🔙 ပင်မစာမျက်နှာ", callback_data: "main_menu" }]] }
    );
  } else {
    await sendMessage(env.BOT_TOKEN, chatId, `❌ စိတ်မကောင်းပါဘူး သူငယ်ချင်းရာ... Boost မအောင်မြင်ဘူးဖြစ်နေတယ်။\n(အကြောင်းပြချက်: ${result.message})\n\n<i>Coin မနှုတ်ထားပါဘူးနော်။ ခဏနေမှ ပြန်စမ်းကြည့်ပါဦး။</i>`);
  }
}

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
    
    const formData = new URLSearchParams();
    formData.append("token", tokenMatch[1]);
    formData.append("timezone_offset", "Asia/Yangon");
    formData.append("timezone_offset_2", "1234");
    formData.append("free_link", tiktokUrl);

    const postRes = await fetch(baseUrl + "?api=1", { method: "POST", headers, body: formData.toString() });
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
