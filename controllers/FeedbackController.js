import express from 'express';
const router = express.Router();
import Feedback from '../models/Feedback.js';
import m from 'mongoose';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import {isMgt} from '../middleware/isStaff.js';
import {isSelf} from '../middleware/isSelf.js';

router.get('/', isMgt, async (req, res) => { // All feedback
	try {
		const page = parseInt(req.query.page, 10);
		const limit = parseInt(req.query.limit, 10);

		const amount = await Feedback.countDocuments({$or: [{approved: true}, {deleted: true}]});
		const feedback = await Feedback.find({$or: [{approved: true}, {deleted: true}]}).skip(limit * (page - 1)).limit(limit).sort({createdAt: 'desc'}).populate('controller', 'fname lname cid').lean();
		res.stdRes.data = {
			amount,
			feedback
		};

	} catch (e) {
		res.stdRes.ret_det = e;
	}
	
	return res.json(res.stdRes);
});

router.post('/', async (req, res) => { // Submit feedback
	try {
		if(req.body.name === '' || req.body.email === '' || req.body.cid === null || req.body.controller === null || req.body.rating === null || req.body.position === null || req.body.comments.length > 5000) { // Validation
			throw {
				code: 400,
				message: `You must fill out all required forms`
			};
		}

		await Feedback.create({
			name: req.body.name,
			email: req.body.email,
			submitter: req.body.cid,
			controller: m.Types.ObjectId(req.body.controller),
			rating: req.body.rating,
			position: req.body.position,
			comments: req.body.comments,
			anonymous: req.body.anon,
			approved: false
		});
	} catch(e) {
		res.stdRes.ret_det = e;
	}
	
	return res.json(res.stdRes);
});

router.get('/controllers', async ({res}) => { // Controller list on feedback page
	try {
		const controllers = await User.find({deletedAt: null}).sort('fname').select('fname lname cid _id').lean();
		res.stdRes.data = controllers;
	} catch(e) {
		res.stdRes.ret_det = e;
	}

	return res.json(res.stdRes);
});

router.get('/unapproved', isMgt, async ({res}) => { // Unapproved feedback
	try {
		const feedback = await Feedback.find({deletedAt: null, approved: false}).populate('controller', 'fname lname cid').lean();
		res.stdRes.data = feedback;
	} catch (e) {
		res.stdRes.ret_det = e;
	}
	return res.json(res.stdRes);
});

router.put('/approve/:id', isMgt, async (req, res) => { // Approve feedback
	try {
		const approved = await Feedback.findOneAndUpdate({_id: req.params.id}, {
			approved: true
		}).populate('controller', '_id');
	
		await Notification.create({
			recipient: approved.controller._id,
			read: false,
			title: 'New Feedback Received',
			content: `You have received new feedback from ${approved.anonymous ? '<b>Anonymous</b>' : '<b>' + approved.name + '</b>'}.`,
			link: '/dash/feedback'
		});
	} catch (e) {
		res.stdRes.ret_det = e;
	}

	return res.json(res.stdRes);
});

router.put('/reject/:id', isMgt, async (req, res) => { // Reject feedback
	try {
		await Feedback.delete({_id: req.params.id});
	} catch(e) {
		res.stdRes.ret_det = e;
	}

	return res.json(res.stdRes);
});

router.get('/:id', isSelf, async (req, res) => {
	try {
		const page = parseInt(req.query.page, 10);
		const limit = parseInt(req.query.limit, 10);
		const userId = m.Types.ObjectId(req.params.id);

		const amount = await Feedback.countDocuments({approved: true, controller: req.params.id});
		const feedback = await Feedback.aggregate([
			{$match: { 
				controller: userId,
				deleted: false
			}},
			{$project: {
				controller: 1,
				position: 1,
				rating: 1,
				comments: 1,
				createdAt: 1,
				anonymous: 1,
				name: { $cond: [ "$anonymous", "$$REMOVE", "$name"]} // Conditionally remove name if submitter wishes to remain anonymous
			}},
			{$skip: limit * (page - 1)},
			{$limit: limit}
		]);

		res.stdRes.data = {
			feedback,
			amount
		};
	} catch(e) {
		res.stdRes.ret_det = e;
	}

	return res.json(res.stdRes);
});


export default router;