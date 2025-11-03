const { ServerClient } = require("@postmark/client");

/**
 * Send an email via Postmark
 * @param {object} options
 * @param {string} options.to - recipient address
 * @param {string} options.subject
 * @param {string} options.htmlBody
 * @param {string} [options.textBody]
 * @param {Array} [options.attachments] - [{Name, Content, ContentType}]
 */
exports.sendEmail = async function sendEmail({
  to,
  subject,
  htmlBody,
  textBody,
  attachments = [],
}) {
  const token = process.env.POSTMARK_SERVER_TOKEN;
  const from = process.env.POSTMARK_FROM;

  if (!token || !from) {
    throw new Error("Missing POSTMARK_SERVER_TOKEN or POSTMARK_FROM");
  }

  const client = new ServerClient(token);

  return client.sendEmail({
    From: from,
    To: to,
    Subject: subject,
    HtmlBody: htmlBody,
    TextBody: textBody,
    Attachments: attachments,
  });
};
