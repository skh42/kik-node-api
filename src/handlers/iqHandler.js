const protobuf = require("../protobuf/protobufParser");

module.exports = (client, callbacks, id, data) => {
  const query = data.find("query");
  if (!query) {
    return;
  }
  const xmlns = query.attrs.xmlns;

  if (xmlns === "jabber:iq:register") {
    if (data.find("node")) {
      client.setNode(data.find("node").text);
    } else if (data.find("captcha-url")) {
      client.emit("receivedcaptcha", data.find("captcha-url").text);
    } else {
      //find others
    }
  } else if (xmlns === "jabber:iq:roster") {
    let groups = [],
      friends = [];
    //fill up friends
    data.findAll("item").forEach(friend => {
      friends.push({
        jid: friend.attrs.jid,
        username: friend.find("username").text,
        displayName: friend.find("display-name").text
      });
    });
    //fill up groups
    data.findAll("g").forEach(group => {
      let users = [];
      group.findAll("m").forEach((user) => {
        const userObj = {
          jid: user.text
        };
        if (user.attrs.s) {
          userObj.isOwner = true;
        }
        if (user.attrs.a) {
          userObj.isAdmin = true;
        }
        users.push(userObj);
      });
      groups.push({
        jid: group.attrs.jid,
        code: group.find("code") ? group.find("code").text : null,
        name: group.find("n") ? group.find("n").text : null,
        users: users
        //null null
      });
    });
    //trigger event and send callback if registered
    client.emit("receivedroster", groups, friends);
    let callback = callbacks.get(id);
    if (callback) {
      callback(groups, friends);
      callbacks.delete(id);
    }
  } else if (xmlns.startsWith("kik:iq:friend")) {
    let users = [];
    //handle empty results
    const error = data.find("error");
    if (error && error.attrs.code === "404") {
      //no results
    } else {
      users = data.findAll("item").map(user => ({
        jid: user.attrs.jid,
        username: user.find("username").text === "Username unavailable" ? null : user.find("username").text,
        displayName: user.find("display-name").text,
        // null sometimes, when you are the user there is no pic (maybe there are other cases idk)
        pic: user.find("pic") ? user.find("pic").text : null
      }));
    }
    //trigger event and send callback if registered
    client.emit("receivedjidinfo", users);
    let callback = callbacks.get(id);
    if (callback) {
      callback(users);
      callbacks.delete(id);
    }
  } else if (xmlns === "kik:iq:xiphias:bridge") {
    const method = query.attrs.method;

    if (method.startsWith("GetUsers")) {
      const {
        users,
        payloads
      } = protobuf.lookupType(`${method}Response`)
        .decode(Buffer.from(data.find("body").text, "base64"));

      let parsedUsers;
      if (users) {
        parsedUsers = users
          .map(({
            backgroundProfilePicExtension,
            registrationElement,
            kinUserIdElement
          }) => ({
            kinUserId: kinUserIdElement.kinUserId.id,
            registrationTimestamp: registrationElement.creationDate.seconds.low,
            backgroundPic: backgroundProfilePicExtension &&
              backgroundProfilePicExtension.extensionDetail.pic
          }));
      } else if (payloads) {
        parsedUsers = payloads
          .map(({
            publicGroupMemberProfile
          }) => ({
            displayName: publicGroupMemberProfile.displayName &&
              publicGroupMemberProfile.displayName.displayName,
            kinUserId: publicGroupMemberProfile.kinUserIdElement.kinUserId.id,
            registrationTimestamp: publicGroupMemberProfile.registrationElement.creationDate.seconds.low,
          }));
      }

      let callback = callbacks.get(id);
      if (callback) {
        callback(parsedUsers);
        callbacks.delete(id);
      }
    } else if (method === "FindGroups") {
      const parsedGroups = protobuf.lookupType("FindGroupsResponse")
        .decode(Buffer.from(data.find("body").text, "base64")).match
        .map(({
          jid,
          displayData,
          groupJoinToken,
          memberCount
        }) => {
          const base64JoinToken = groupJoinToken.token.toString("base64");
          return {
            jid: `${jid.localPart}@groups.kik.com`,
            code: displayData.hashtag,
            name: displayData.displayName,
            joinToken: base64JoinToken.endsWith("=") ?
              base64JoinToken.slice(0, base64JoinToken.indexOf("=")) : base64JoinToken,
            memberCount,
          };
        });
      let callback = callbacks.get(id);
      if (callback) {
        callback(parsedGroups);
        callbacks.delete(id);
      }
    }

  }
};