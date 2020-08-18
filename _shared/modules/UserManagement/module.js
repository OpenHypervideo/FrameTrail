/**
 * @module Shared
 */


/**
 * I contain all business logic about the UserManagement.
 *
 * I control both the UI as well as the data model for user management (registration, settings, administration) and the user login.
 *
 * @class UserManagement
 * @static
 */



FrameTrail.defineModule('UserManagement', function(FrameTrail){


	var userID                  = '',
		userRole				= '',
		userMail                = '',
		userRegistrationDate    = '',
		userColorCollection		= [],
		userSessionLifetime		= 0,
		userSessionTimeout		= null,

		userBoxCallback 		= null,
		userBoxCallbackCancel 	= null,

		domElement 	= $(	'<div class="UserBox" title="User Management">'
						+   '    <div class="userStatusMessage message">'
						+	'    </div>'
						+   '    <div class="userTabs">'
						+	'        <ul class="userTabMenu">'
						+	'            <li class="userTabSettingsMenu">'
						+   '                <a href="#UserTabSettings">My Settings</a>'
						+   '            </li>'
						+	'            <li class="userTabRegistrationMenu">'
						+   '                <a href="#UserTabRegistration">Register Users</a>'
						+   '            </li>'
						+	'            <li class="userTabAdministrationMenu">'
						+   '                <a href="#UserTabAdministration">User Administration</a>'
						+   '            </li>'
						+	'        </ul>'
						+	'        <div id="UserTabSettings">'
						+   '             <form class="settingsForm" method="post">'
						+	'             	<p class="settingsFormStatus message"></p>'
						+   '             	<input type="text" name="name" id="SettingsForm_name" placeholder="Your Name">'
						+   '             	<input type="text" name="mail" id="SettingsForm_mail" placeholder="Mail"><br>'
						+	'				<div class="userColor"></div>'
						+   '             	<input type="password" name="passwd" id="SettingsForm_passwd" placeholder="New password"><br>'
						+   '             	<br>'
						+   '             	<input type="hidden" name="a" value="userChange">'
						+	'             	<input type="hidden" name="userID" id="SettingsForm_userID" value="">'
						+   '             	<input type="submit" value="Change my settings!">'
						+   '             </form>'
						+	'        </div>'
						+	'        <div id="UserTabRegistration">'
						+	'             <form class="registrationForm" method="post">'
						+	'             	<p class="registrationFormStatus message"></p>'
						+	'             	<input type="text" name="name" placeholder="Your Name">'
						+	'             	<input type="text" name="mail" placeholder="Mail"><br>'
						+	'             	<input type="password" name="passwd" placeholder="Password"><br>'
						+	'             	<input type="hidden" name="a" value="userRegister">'
						+	'             	<input type="submit" value="Register new user!">'
						+	'             </form>'
						+	'        </div>'
						+	'        <div id="UserTabAdministration">'
						+	'             <p class="administrationFormStatus message"></p>'
						+   '             <button class="administrationFormRefresh">Refresh</button>'
						+   '             <form class="administrationForm" method="post">'
                        +   '               <div class="selectUserContainer" class="ui-front">'
						+   '                   <select name="userID" id="user_change_user">'
						+  	'                       <option value="" selected disabled>Select a User</option>'
			            +   '                   </select>'
                        +   '               </div>'
                        +   '               <div class="userDataContainer">'
						+   '             	    <input type="text" name="name" id="user_change_name" placeholder="Name">'
						+   '             	    <input type="text" name="mail" id="user_change_mail" placeholder="Mail"><br>'
						+	'					<div id="user_change_colorContainer"></div>'
						+   '             	    <input type="password" name="passwd" id="user_change_passwd" placeholder="Password"><br><br>'
						+   '             	    <input type="radio" name="role" id="user_change_role_admin" value="admin">'
                        +   '                   <label for="user_change_role_admin">Admin</label>'
						+   '             	    <input type="radio" name="role" id="user_change_role_user" value="user">'
                        +   '                   <label for="user_change_role_user">User</label><br><br>'
						+   '             	    <input type="radio" name="active" id="user_change_active_1" value="1">'
                        +   '                   <label for="user_change_active_1">Active</label>'
						+   '             	    <input type="radio" name="active" id="user_change_active_0" value="0">'
                        +   '                   <label for="user_change_active_0">Inactive</label><br><br>'
						+   '             	    <input type="hidden" name="a" value="userChange">'
						+   '             	    <input type="submit" value="Change this user\'s settings.">'
                        +   '               </div>'
						+   '             </form>'
						+	'        </div>'
                        +   '    </div>'
						+	'</div>'),

	loginBox = $(	'<div class="userLoginOverlay ui-blocking-overlay">'
				+   '    <div class="loginBox ui-overlay-box">'
				+   '        <div class="boxTitle">'
				+   '            <span class="loginTabButton loginBoxTabButton">Login</span>'
				+   '            <span style="color: #888; font-size: 17px;">or</span>'
				+   '            <span class="createAccountTabButton loginBoxTabButton inactive">Create an Account</span>'
				+   '        </div>'
				+	'        <div class="userTabLogin">'
				+	'             <form class="loginForm" method="post">'
				+	'             	<p class="loginFormStatus message"></p>'
				+	'             	<input type="text" name="mail" placeholder="Mail"><br>'
				+	'             	<input type="password" name="passwd" placeholder="Password"><br>'
				+	'             	<input type="hidden" name="a" value="userLogin">'
				+	'             	<input type="submit" value="Login">'
				+	'             	<button type="button" class="loginBoxCancelButton">Cancel</button>'
				+	'             </form>'
				+	'        </div>'
				+	'        <div class="userTabRegister">'
				+	'             <form class="userRegistrationForm" method="post">'
				+	'             	<p class="userRegistrationFormStatus" class="message"></p>'
				+	'             	<input type="text" name="name" placeholder="Your Name">'
				+	'             	<input type="text" name="mail" placeholder="Mail"><br>'
				+	'             	<input type="password" name="passwd" placeholder="Password"><br>'
				+	'             	<input type="hidden" name="a" value="userRegister"><br>'
				+	'             	<input type="submit" value="Create Account">'
				+	'             	<button type="button" class="loginBoxCancelButton">Cancel</button>'
				+	'             </form>'
				+	'        </div>'
                +   '    </div>'
				+	'</div>');


	/* Administration Box */

	domElement.find('.userTabs').tabs({
        heightStyle: "fill"
    });


	domElement.find('.registrationForm').ajaxForm({
		method: 	"POST",
		url: 		"_server/ajaxServer.php",
		dataType:   "json",
		success: function(response) {

			switch(response.code){
				case 0:
					domElement.find('.registrationFormStatus').removeClass('error').addClass('active success').text('Your are registered, please login now.');
					break;
				case 1:
					domElement.find('.registrationFormStatus').removeClass('success').addClass('active error').text('Please fill out all fields! Is the mail adress valid?');
					break;
				case 2:
					domElement.find('.registrationFormStatus').removeClass('success').addClass('active error').text('Email already exists.');
					break;
				case 3:
					domElement.find('.registrationFormStatus').removeClass('success error').addClass('active').text('You are registered, but you need to get activated by an admin!');
					break;

			}
		}
	});


	domElement.find('.settingsForm').ajaxForm({
		method: 	"POST",
		url: 		"_server/ajaxServer.php",
		dataType:   "json",
		success: function(response) {
			switch(response.code){
				case 0:
					FrameTrail.module('Database').users[FrameTrail.module('UserManagement').userID].color = response.response.color;
					FrameTrail.changeState('username', response.response.name);
					FrameTrail.changeState('userColor', response.response.color);

					domElement.find('.settingsFormStatus').removeClass('error').addClass('active success').text('Your settings were successfully changed.');
					break;
				case 1:
					domElement.find('.settingsFormStatus').removeClass('success').addClass('active error').text('Fatal error: User database could not be found.');
					break;
				case 2:
					domElement.find('.settingsFormStatus').removeClass('success').addClass('active error').text('Fatal Error: You are not you anymore!');
					break;
				case 3:
					domElement.find('.settingsFormStatus').removeClass('success error').addClass('active').text('Your settings were saved, except your mail adress, because it was not valid!');
					break;
				case 4:
					domElement.find('.settingsFormStatus').removeClass('success').addClass('active error').text('Fatal error: You are not logged in anymore!');
					break;
				case 5:
					domElement.find('.settingsFormStatus').removeClass('success').addClass('active error').text('Your account was deactivated. Contact an admin!');
					break;
				case 6:
					domElement.find('.settingsFormStatus').removeClass('success').addClass('active error').text('Fatal error: your user was not found in the database.');
					break;

			}
		}
	});


	var refreshAdministrationForm = function(){


		domElement.find('.administrationForm')[0].reset();
        domElement.find('.userDataContainer').hide();


		$.ajax({
			method: 	"POST",
			url: 		"_server/ajaxServer.php",
			dataType: 	"json",
            data: 		"a=userGet",
			success: function(data) {

				if (!data.response) {
					console.error('User file is missing.');
					return;
				}

				var allUsers = data.response.user;

				domElement.find("#user_change_user").html('<option value="" selected disabled>Select a User</option>');

				for (var id in allUsers) {
					domElement.find("#user_change_user").append('<option value="' + id + '">' + allUsers[id].name + '</option>');
				}

                domElement.find("#user_change_user").selectmenu('refresh');

                domElement.find("#user_change_user").unbind('selectmenuchange').bind('selectmenuchange', function(evt){

					evt.preventDefault();

					$.ajax({
						method: "POST",
						url: 	"_server/ajaxServer.php",
						data: 	{	"a": "userGet",
									"userID": $("#user_change_user option:selected").val()
								},

						success: function(ret) {
							domElement.find("#user_change_name").val(ret["response"]["name"]);
							domElement.find("#user_change_mail").val(ret["response"]["mail"]);
							domElement.find("#user_change_color").val(ret["response"]["color"]);
							domElement.find("#user_change_passwd").val("");
							domElement.find(".administrationForm input[name='role']").prop("checked",false).removeAttr("checked");
							domElement.find(".administrationForm input#user_change_role_"+ret["response"]["role"]).prop("checked",true).attr("checked","checked");
							domElement.find(".administrationForm input[name='active']").prop("checked",false).removeAttr("checked");
							domElement.find(".administrationForm input#user_change_active_"+ret["response"]["active"]).prop("checked",true).attr("checked","checked");
							getUserColorCollection(function() {
								renderUserColorCollectionForm(ret["response"]["color"],"#user_change_colorContainer");
							});
                            domElement.find('.userDataContainer').show();
						}
					});


				});

			}
		});

	}


	domElement.find('.administrationFormRefresh').click(refreshAdministrationForm);

	if (FrameTrail.module('RouteNavigation').environment.server) {
        refreshAdministrationForm();
    }


	domElement.find(".administrationForm").ajaxForm({
		method: 	"POST",
		url: 		"_server/ajaxServer.php",
		dataType: 	"json",
		success: function(response) {
			// TODO: Update client userData Object if Admin edited himself via this view instead of "Settings" Tab
			refreshAdministrationForm();

			switch(response.code){
				case 0:
					domElement.find('.administrationFormStatus').removeClass('error').addClass('active success').text('The settings were successfully changed.');
					break;
				case 1:
					domElement.find('.administrationFormStatus').removeClass('success').addClass('active error').text('Fatal error: User database could not be found.');
					break;
				case 2:
					domElement.find('.administrationFormStatus').removeClass('success').addClass('active error').text('Fatal Error: You are not an admin (or even not you) anymore!');
					break;
				case 3:
					domElement.find('.administrationFormStatus').removeClass('error success').addClass('active').text('The settings were saved, except the mail adress, because it was not valid!');
					break;
				case 4:
					domElement.find('.administrationFormStatus').removeClass('success').addClass('active error').text('Fatal error: You are not logged in anymore!');
					break;
				case 5:
					domElement.find('.administrationFormStatus').removeClass('success').addClass('active error').text('Your account was deactivated. Contact an admin!');
					break;
				case 6:
					domElement.find('.administrationFormStatus').removeClass('success').addClass('active error').text('Fatal error: your user was not found in the database.');
					break;

			}

		}
	});


	$(FrameTrail.getState('target')).append(domElement);


	function renderUserColorCollectionForm(selectedColor, targetElement) {
		var elem = $("<div class='userColorCollectionContainer'><input type='hidden' name='color' value='"+ selectedColor +"'>User Color:<div class='userColorCollection'></div></div>");
		for (var c in userColorCollection) {
			elem.find(".userColorCollection").append("<div class='userColorCollectionItem"+((userColorCollection[c] == selectedColor) ? " selected" : "")+"' style='background-color:#"+userColorCollection[c]+"' data-color='"+userColorCollection[c]+"'></div>");
		}
		elem.on("click", ".userColorCollectionItem", function() {
			elem.find(".userColorCollectionItem.selected").removeClass("selected");
			$(this).addClass("selected");
			elem.find("input[name='color']").val($(this).data("color"));
		});

		$(targetElement).html(elem);
	}

	function getUserColorCollection(callback) {
		$.getJSON("_data/config.json", function(data) {
			userColorCollection = data["userColorCollection"];
			if (typeof(callback) == "function") {
				callback.call();
			}
		});

	}

	var userDialog = domElement.dialog({
		autoOpen: false,
		modal: true,
		width: 600,
		height: 460,
        open: function() {
            domElement.find('.userTabs').tabs('refresh');
			getUserColorCollection(function() {
				renderUserColorCollectionForm(userColor,".userColor")
			});
        },
        close: function() {
			closeAdministrationBox();
		}
	});

    domElement.find('#user_change_user').selectmenu({
        width: 150,
        icons: { button: "icon-angle-down" }
    });


    /* Login Box */

    loginBox.find('.loginBoxCancelButton').click(function() {
    	if(typeof userBoxCallbackCancel === 'function'){
			userBoxCallbackCancel.call();
		}
		closeLoginBox();
    });

    loginBox.find('.loginBoxTabButton').click(function(evt) {

    	loginBox.find('.loginBoxTabButton').removeClass('inactive');

    	if ( $(this).hasClass('loginTabButton') ) {

    		loginBox.find('.createAccountTabButton').addClass('inactive');
    		loginBox.find('.userTabRegister').hide();
    		loginBox.find('.userTabLogin').show();

    	} else {

    		loginBox.find('.loginTabButton').addClass('inactive');
    		loginBox.find('.userTabLogin').hide();
    		loginBox.find('.userTabRegister').show();

    	}

    });

    loginBox.find('.loginForm').ajaxForm({

		method: 	"POST",
		url: 		"_server/ajaxServer.php",
		dataType:   "json",

		success: function(response) {
			//console.log(response);
			switch(response.code){

				case 0:
					userSessionLifetime = parseInt(response.session_lifetime);
					login(response.userdata);

					FrameTrail.triggerEvent('userAction', {
						action: 'UserLogin',
						userID: response.userdata.id,
						userName: response.userdata.name,
						userRole: response.userdata.role,
						userMail: response.userdata.mail
					});

					loginBox.find('.loginFormStatus').removeClass('active error success').text('');
					updateView(true);
					if(typeof userBoxCallback === 'function'){
						userBoxCallback.call();
						closeLoginBox();
					}
					break;

				case 1:
					loginBox.find('.loginFormStatus').removeClass('success').addClass('active error').text('Please fill out all fields');
					break;
				case 2:
					loginBox.find('.loginFormStatus').removeClass('success').addClass('active error').text('User not known');
					break;
				case 3:
					loginBox.find('.loginFormStatus').removeClass('success').addClass('active error').text('Incorrect Password');
					break;
				case 4:
					loginBox.find('.loginFormStatus').removeClass('success').addClass('active error').text('Fatal error: Could not find user database.');
					break;
				case 5:
					loginBox.find('.loginFormStatus').removeClass('success').addClass('active error').text('User is not active. Please contact an admin!');
					break;
			}

		}

	});


	loginBox.find('.userRegistrationForm').ajaxForm({
		method: 	"POST",
		url: 		"_server/ajaxServer.php",
		dataType:   "json",
		success: function(response) {

			switch(response.code){
				case 0:
					loginBox.find('.loginFormStatus').removeClass('error').addClass('active success').text('Your are registered, please login now.');
					loginBox.find('.loginTabButton').click();
					FrameTrail.module('InterfaceModal').showStatusMessage('Updating Client Data ...');
					FrameTrail.module('Database').loadData(function() {
						FrameTrail.module('InterfaceModal').showStatusMessage('Client Data updated');
						FrameTrail.module('InterfaceModal').hideMessage(800);
					}, function() {
						FrameTrail.module('InterfaceModal').showErrorMessage('Error updating client data. Please reload the page.');
					});
					break;
				case 1:
					loginBox.find('.userRegistrationFormStatus').removeClass('success').addClass('active error').text('Please fill out all fields! Is the mail adress valid?');
					break;
				case 2:
					loginBox.find('.userRegistrationFormStatus').removeClass('success').addClass('active error').text('Email already exists.');
					break;
				case 3:
					loginBox.find('.userRegistrationFormStatus').removeClass('success error').addClass('active').text('You are registered, but you need to get activated by an admin before you can login!');
					break;

			}
		}
	});

	$(FrameTrail.getState('target')).append(loginBox);




	/**
	 * Sometimes a routine should only execute, if we can ensure the user is logged in at this point.
	 *
	 * I serve this purpose, by checking wether the user has already logged in, and if not provide him the chance
	 * to login (or even create an account first).
	 *
	 * After the user has logged in I call the callback (the routine which shall execute only with a logged-in user).
	 *
	 * If the user aborted the offer to login, an optional cancelCallback can be called.
	 *
	 * @method ensureAuthenticated
	 * @param {Function} callback
	 * @param {Function} callbackCancel (optional)
	 * @param {Boolean} disallowCancel (optional)
	 */
	function ensureAuthenticated(callback, callbackCancel, disallowCancel){

		isLoggedIn(function(loginStatus) {

			if (loginStatus){

				callback.call()

			} else {

				userBoxCallback = callback;
				userBoxCallbackCancel = callbackCancel;

				if (disallowCancel) {
					showLoginBox(true);
				} else {
					showLoginBox();
				}


			}

		});


	}


	/**
	 * I check wether the user has logged in, and call the callback with a boolean to indicate this.
	 *
	 * @method isLoggedIn
	 * @param {Function} callback
	 */
	function isLoggedIn(callback) {

		if (!FrameTrail.module('RouteNavigation').environment.server) {
            window.setTimeout(function() {
            	FrameTrail.changeState({
					editMode: false,
					loggedIn: false,
					username: '',
					userColor: ''
				});
	            callback.call(window, false);
            }, 2);

            return;
        }

		$.ajax({
			method: 	"POST",
			url: 		"_server/ajaxServer.php",
			dataType: 	"json",
            data: 		"a=userCheckLogin",
			success: function(response) {
				switch(response.code){

					case 0:
						logout();
						callback.call(window, false);
						break;

					case 1:
						userSessionLifetime = parseInt(response.session_lifetime);
						login(response.response);
						callback.call(window, true);
						break;

					case 2:
						console.error('User file is missing.');
						FrameTrail.changeState({
							editMode: false,
							loggedIn: false,
							username: '',
							userColor: ''
						});
						callback.call(window, false);
						break;

					case 3:
						console.error('Logged in but user not active');
						break;

					case 4:
						console.error('Logged in but not with required role.');
						break;

				}


			}
		});

	}


	/**
	 * I am called to update my local and gloabl state __after__ the server has created a login session.
	 *
	 * @method login
	 * @param {} userData
	 * @private
	 */
	function login(userData) {

		userID    = userData.id;
		userRole  = userData.role;
		userMail  = userData.mail;
		userRegistrationDate = userData.registrationDate;

		resetSessionTimeout();

		FrameTrail.changeState('username', userData.name);
		FrameTrail.changeState('userColor', userData.color);
		FrameTrail.changeState('loggedIn', true);

		updateView(true);

	}


	/**
	 * I am called to close the login session and update my local and global state.
	 *
	 * @method logout
	 */
	function logout() {

		$.ajax({
			method: 	"POST",
			url: 		"_server/ajaxServer.php",
			dataType: 	"json",
            data: 		"a=userLogout",
			success: function(data) {

				if (userID != '') {
					var loggedOutDialog = $('<div class="loggedOutDialog" title="Logged Out">'
                                      + '    <div class="message success active">You have been logged out.</div>'
                                      + '</div>');

	                loggedOutDialog.dialog({
						resizable: false,
						modal: true,
						close: function() {
							
							try {
								if (TogetherJS && TogetherJS.running) {
	                                var elementFinder = TogetherJS.require("elementFinder");
	                                var location = elementFinder.elementLocation($(this)[0]);
	                                TogetherJS.send({
	                                    type: "simulate-dialog-close", 
	                                    element: location
	                                });
	                          	}
	                        } catch (e) {}

							FrameTrail.triggerEvent('userAction', {
								action: 'UserLogout'
							});

							if (FrameTrail.module('Database').config.alwaysForceLogin) {
								FrameTrail.module('InterfaceModal').hideMessage();
								FrameTrail.module('UserManagement').ensureAuthenticated(function() {}, function() {}, true);
							}

							loggedOutDialog.remove();
							/*
							window.setTimeout(function() {
                                window.location.reload();
                            }, 100);
                            */
						},
						buttons: {
							"OK": function() {
								$( this ).dialog( "close" );
							}
						}
	                });
				}

				userID    = '';
				userRole  = '';
				userMail  = '';
				userRegistrationDate = '';

				FrameTrail.changeState({
					editMode: false,
					loggedIn: false,
					username: '',
					userColor: ''
				});

				updateView(false);

				FrameTrail.triggerEvent('userAction', {
					action: 'UserLogout'
				});

			}

		});

	}


	/**
	 * The UI of the UserManagement has to be updated, when the loginStatus changes.
	 *
	 * I check wether the user is an admin or a normal user, and show and hide the respective tabs (Settings and Administration) accordingly.
	 *
	 * @method updateView
	 * @param {Boolean} loginStatus
	 * @private
	 */
	function updateView(loginStatus){

		if (loginStatus){

			//domElement.find('#UserStatusMessage').addClass('active').text('Hello! Your are logged in, '+ FrameTrail.getState('username') +'.');

			domElement.find('.userTabSettingsMenu').show();
			updateSettings();

			if (userRole === 'admin'){
				domElement.find('.userTabAdministrationMenu').show();
				updateAdministration();
				$(FrameTrail.getState('target')).addClass('frametrail-admin');
			}


		} else {

			domElement.find('.userTabSettingsMenu').hide();
			domElement.find('.userTabAdministrationMenu').hide();
			$(FrameTrail.getState('target')).removeClass('frametrail-admin');

		}


	}


	/**
	 * I update the UI elements of the tab Settings
	 * @method updateSettings
	 * @private
	 */
	function updateSettings() {

		domElement.find('#SettingsForm_name')[0].value   = FrameTrail.getState('username');
		domElement.find('#SettingsForm_mail')[0].value   = userMail;
		//domElement.find('#SettingsForm_color')[0].value  = userColor;
		domElement.find('#SettingsForm_passwd')[0].value = '';
		domElement.find('#SettingsForm_userID')[0].value = userID;

	}


	/**
	 * I update the UI elements of the tab Administration
	 *
	 * (WAS MOVED AT A WRONG PLACE)
	 *
	 * @method updateAdministration
	 * @private
	 */
	function updateAdministration() {



	}


	/**
	 * I open the login box.
	 * The UI is a single DOM element
	 *
	 * @method showLoginBox
	 * @param {Boolean} disallowCancel
	 */
	function showLoginBox(disallowCancel) {

		if (disallowCancel) {
			loginBox.find('.loginBoxCancelButton').hide();
		} else {
			loginBox.find('.loginBoxCancelButton').show();
		}

		loginBox.find('.message').removeClass('active error').text('');
		loginBox.find('.loginForm').resetForm();
		loginBox.find('.userRegistrationForm').resetForm();

		loginBox.fadeIn();

	}


	/**
	 * I close the login box.
	 *
	 * @method closeLoginBox
	 */
	function closeLoginBox() {

		userBoxCallback = null;
		userBoxCallbackCancel = null;

		loginBox.fadeOut();

	}


	/**
	 * I open the user administration dialog.
	 * The UI is a single DOM element, which is displayed via jQuery UI Dialog
	 *
	 * @method showAdministrationBox
	 */
	function showAdministrationBox() {

		ensureAuthenticated(function() {

			updateView(true);
			domElement.dialog('open');

		});

	}


	/**
	 * I close the user administration dialog (jQuery UI Dialog).
	 *
	 * @method closeAdministrationBox
	 * @return
	 */
	function closeAdministrationBox() {

		userDialog.dialog('close');

	}


	/**
	 * I start the (PHP) session timeout counter.
	 *
	 * @method startSessionTimeout
	 * @return
	 */
	function startSessionTimeout() {

		// session lifetime minus 30 seconds
		var timeoutDuration = (userSessionLifetime-30) * 1000;
		//console.log('Starting Session Timeout at: ' + Math.floor( (userSessionLifetime-30) / 60 ) + ' minutes');
		userSessionTimeout = setTimeout(function() {
			// Renew Session
			//console.log('Renewing Session ...');
			isLoggedIn(function(){});
		}, timeoutDuration);

	}


	/**
	 * I reset the (PHP) session timeout counter.
	 *
	 * @method resetSessionTimeout
	 * @return
	 */
	function resetSessionTimeout() {

		clearTimeout(userSessionTimeout);
		startSessionTimeout();

	}


	// Init the user model
	isLoggedIn(function(){});


	return {

		showLoginBox: 	        showLoginBox,
		closeLoginBox: 	        closeLoginBox,
		showAdministrationBox: 	showAdministrationBox,
		closeAdministrationBox: closeAdministrationBox,

		isLoggedIn: 			isLoggedIn,
		ensureAuthenticated: 	ensureAuthenticated,
		logout: 				logout,

		/**
		 * The current userID or an empty String.
		 * @attribute userID
		 */
		get userID()    { return userID.toString()   },
		/**
		 * The users mail adress as a String.
		 * @attribute userMail
		 */
		get userMail()  { return userMail            },
		/**
		 * The users role, which is either 'admin' or 'user', or – when not logged in – an empty String.
		 * @attribute userRole
		 */
		get userRole()  { return userRole            },
		/**
		 * The users registration Date, which is a Number (milliseconds since 01-01-1970)
		 * @attribute userRegistrationDate
		 */
		get userRegistrationDate() { return userRegistrationDate }

	};


});
