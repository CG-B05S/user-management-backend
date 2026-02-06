const cron = require("node-cron");
const User = require("../models/User");
const AuthUser = require("../models/AuthUser");
const sendMail = require("../utils/sendMail");

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
        html: `
          <div style="font-family:Arial">
            <h3>Follow-up Reminder</h3>
            <p>You have a follow-up scheduled in 5 minutes.</p>

            <b>Company:</b> ${user.companyName}<br/>
            <b>Contact:</b> ${user.contactNumber}<br/>
            <b>Address:</b> ${user.address}<br/>
            <b>Status:</b> ${user.status}<br/>
            <b>Follow Up Time:</b> ${user.followUpDateTime}
          </div>
        `
      });

      // prevent duplicate email
      user.followUpReminderSent = true;
      await user.save();
    }

  } catch (err) {
    console.error("Follow-up job error:", err);
  }
});
