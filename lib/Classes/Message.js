"use strict";
const fileType = require("file-type");
const config = require("../../config");
const { isUrl, store, getBuffer, writeExifWebp, decodeJid } = require("..");
const fs = require("fs");
const PhoneNumber = require("awesome-phonenumber");
const {
  generateWAMessageFromContent,
  generateWAMessage,
} = require("@adiwajshing/baileys");
const Base = require("./Base");
const ReplyMessage = require("./ReplyMessage");
class Message extends Base {
  constructor(client, data, msg) {
    super(client, data);
    if (data) this._patch(data, msg);
  }
  _patch(data, msg) {
    this.user = decodeJid(this.client.user.id);
    this.key = data.key;
    this.isGroup = data.isGroup;
    this.prefix = data.prefix;
    this.command = data.command;
    this.id = data.key.id === undefined ? undefined : data.key.id;
    this.jid = data.key.remoteJid;
    this.message = { key: data.key, message: data.message };
    this.pushName = data.pushName;
    this.participant = data.sender;
    this.sudo = config.SUDO.split(",").includes(this.participant.split("@")[0]);
    this.text = data.body;
    this.fromMe = data.key.fromMe;
    this.message = msg.message;
    this.timestamp =
      typeof data.messageTimestamp === "object"
        ? data.messageTimestamp.low
        : data.messageTimestamp;

    if (
      data.message.hasOwnProperty("extendedTextMessage") &&
      data.message.extendedTextMessage.hasOwnProperty("contextInfo") === true &&
      data.message.extendedTextMessage.contextInfo.hasOwnProperty(
        "mentionedJid"
      )
    ) {
      this.mention = data.message.extendedTextMessage.contextInfo.mentionedJid;
    } else {
      this.mention = false;
    }

    if (
      data.message.hasOwnProperty("extendedTextMessage") &&
      data.message.extendedTextMessage.hasOwnProperty("contextInfo") === true &&
      data.message.extendedTextMessage.contextInfo.hasOwnProperty(
        "quotedMessage"
      )
    ) {
      this.reply_message = new ReplyMessage(
        this.client,
        data.message.extendedTextMessage.contextInfo,
        data
      );
      this.reply_message.type = data.quoted.type || "extendedTextMessage";
      this.reply_message.mtype = data.quoted.mtype;
      this.reply_message.mimetype = data.quoted.text.mimetype || "text/plain";
      this.reply_message.key = data.quoted.key;
      this.reply_message.message = data.quoted.message;
    } else {
      this.reply_message = false;
    }

    return super._patch(data);
  }
  async log() {
    console.log(this.data);
  }
  async sendFile(content, options = {}) {
    let { data } = await this.client.getFile(content);
    let type = await fileType.fromBuffer(data);
    return this.client.sendMessage(
      this.jid,
      { [type.mime.split("/")[0]]: data, ...options },
      { ...options }
    );
  }
  async downloadMediaMessage() {
    let buff = await this.m.download();
    let type = await fileType.fromBuffer(buff);
    let name = new Date() + type.ext;
    await fs.promises.writeFile(name, buff);
    return name;
  }
  async reply(text, opt = {}) {
    return this.client.sendMessage(
      this.jid,
      {
        text: require("util").format(text),
        ...opt,
      },
      { ...opt, quoted: this }
    );
  }
  async send(jid, text, opt = {}) {
    return this.client.sendMessage(
      jid,
      {
        text: require("util").format(text),
        ...opt,
      },
      { ...opt }
    );
  }
  async sendMessage(
    content,
    opt = { packname: "Xasena", author: "X-electra" },
    type = "text"
  ) {
    switch (type.toLowerCase()) {
      case "text":
        {
          return this.client.sendMessage(
            this.jid,
            {
              text: content,
              ...opt,
            },
            { ...opt }
          );
        }
        break;
      case "image":
        {
          if (Buffer.isBuffer(content)) {
            return this.client.sendMessage(
              this.jid,
              { image: content, ...opt },
              { ...opt }
            );
          } else if (isUrl(content)) {
            return this.client.sendMessage(
              this.jid,
              { image: { url: content }, ...opt },
              { ...opt }
            );
          }
        }
        break;
      case "video": {
        if (Buffer.isBuffer(content)) {
          return this.client.sendMessage(
            this.jid,
            { video: content, ...opt },
            { ...opt }
          );
        } else if (isUrl(content)) {
          return this.client.sendMessage(
            this.jid,
            { video: { url: content }, ...opt },
            { ...opt }
          );
        }
      }
      case "audio":
        {
          if (Buffer.isBuffer(content)) {
            return this.client.sendMessage(
              this.jid,
              { audio: content, ...opt },
              { ...opt }
            );
          } else if (isUrl(content)) {
            return this.client.sendMessage(
              this.jid,
              { audio: { url: content }, ...opt },
              { ...opt }
            );
          }
        }
        break;
      case "template":
        let optional = await generateWAMessage(this.jid, content, opt);
        let message = {
          viewOnceMessage: {
            message: {
              ...optional.message,
            },
          },
        };
        await this.client.relayMessage(this.jid, message, {
          messageId: optional.key.id,
        });

        break;
      case "sticker":
        {
          let { data, mime } = await this.client.getFile(content);
          if (mime == "image/webp") {
            let buff = await writeExifWebp(data, opt);
            await this.client.sendMessage(
              this.jid,
              { sticker: { url: buff }, ...opt },
              opt
            );
          } else {
            mime = await mime.split("/")[0];

            if (mime === "video") {
              await this.client.sendImageAsSticker(this.jid, content, opt);
            } else if (mime === "image") {
              await this.client.sendImageAsSticker(this.jid, content, opt);
            }
          }
        }
        break;
    }
  }

  async forward(jid, message, options = {}) {
    let m = generateWAMessageFromContent(jid, message, {
      ...options,
      userJid: this.client.user.id,
    });
    await this.client.relayMessage(jid, m.message, {
      messageId: m.key.id,
      ...options,
    });
    return m;
  }
  async sendFromUrl(url, options = {}) {
    let buff = await getBuffer(url);
    let mime = await fileType.fromBuffer(buff);
    let type = mime.mime.split("/")[0];
    if (type === "audio") {
      options.mimetype = "audio/mpeg";
    }
    if (type === "application") type = "document";
    return this.client.sendMessage(
      this.jid,
      { [type]: buff, ...options },
      { ...options }
    );
  }

  async PresenceUpdate(status) {
    await sock.sendPresenceUpdate(status, this.jid);
  }
  async delete(key) {
    await this.client.sendMessage(this.jid, { delete: key });
  }
  async updateName(name) {
    await this.client.updateProfileName(name);
  }
  async getPP(jid) {
    return await this.client.profilePictureUrl(jid, "image");
  }
  async setPP(jid, pp) {
    if (Buffer.isBuffer(pp)) {
      await this.client.updateProfilePicture(jid, pp);
    } else {
      await this.client.updateProfilePicture(jid, { url: pp });
    }
  }
  /**
   *
   * @param {string} jid
   * @returns
   */
  async block(jid) {
    await this.client.updateBlockStatus(jid, "block");
  }
  /**
   *
   * @param {string} jid
   * @returns
   */
  async unblock(jid) {
    await this.client.updateBlockStatus(jid, "unblock");
  }
  /**
   *
   * @param {array} jid
   * @returns
   */
  async add(jid) {
    return await this.client.groupParticipantsUpdate(this.jid, jid, "add");
  }
  /**
   *
   * @param {array} jid
   * @returns
   */
  async kick(jid) {
    return await this.client.groupParticipantsUpdate(this.jid, jid, "remove");
  }

  /**
   *
   * @param {array} jid
   * @returns
   */
  async promote(jid) {
    return await this.client.groupParticipantsUpdate(this.jid, jid, "promote");
  }
  /**
   *
   * @param {array} jid
   * @returns
   */
  async demote(jid) {
    return await this.client.groupParticipantsUpdate(this.jid, jid, "demote");
  }
  async getName(jid, withoutContact = false) {
    id = decodeJid(jid);
    withoutContact = this.client.withoutContact || withoutContact;
    let v;
    if (id.endsWith("@g.us"))
      return new Promise(async (resolve) => {
        v = store.contacts[id] || {};
        if (!(v.name.notify || v.subject))
          v = this.client.groupMetadata(id) || {};
        resolve(
          v.name ||
            v.subject ||
            PhoneNumber("+" + id.replace("@s.whatsapp.net", "")).getNumber(
              "international"
            )
        );
      });
    else
      v =
        id === "0@s.whatsapp.net"
          ? {
              id,
              name: "WhatsApp",
            }
          : id === decodeJid(this.client.user.id)
          ? this.client.user
          : store.contacts[id] || {};

    return (
      (withoutContact ? "" : v.name) ||
      v.subject ||
      v.verifiedName ||
      PhoneNumber("+" + jid.replace("@s.whatsapp.net", "")).getNumber(
        "international"
      )
    );
  }
}

module.exports = Message;
