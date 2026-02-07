const cron = require("node-cron");
const User = require("../models/User");
const AuthUser = require("../models/AuthUser");
const sendMail = require("../utils/sendMail");
const { followUpReminderEmail } = require("../utils/emailTemplates");

// runs every minute
cron.schedule("* * * * *", async () => {
  console.log("Checking follow-ups...");

  try {
    const now = new Date();

    // time after 5 minutes
    const fiveMinutesLater = new Date(now.getTime() + 5 * 60000);

    const users = await User.find({
      status: "callback",
      followUpDateTime: {
        $lte: fiveMinutesLater
      },
      followUpReminderSent: false
    });

    for (const user of users) {

      // get logged-in user email
      const owner = await AuthUser.findById(user.createdBy);

      if (!owner) continue;

      await sendMail({
        to: owner.email,
        subject: "Follow-up Reminder (5 Minutes)",
        html: followUpReminderEmail(user)
      });

      // prevent duplicate email
      user.followUpReminderSent = true;
      await user.save();
    }

  } catch (err) {
    console.error("Follow-up job error:", err);
  }
});
