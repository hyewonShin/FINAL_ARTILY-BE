const Review = require("../../schemas/review.schemas");
const express = require("express");
const { create } = require("../../schemas/review.schemas");
const moment = require("moment");
const CryptoJS = require("crypto-js");

const s3 = require("../config/s3");

const sharp = require("sharp");
const fs = require("fs");
const { v4 } = require("uuid");
const uuid = () => {
  const tokens = v4().split("-");
  return tokens[2] + tokens[1] + tokens[3];
};

// 리뷰 조회(무한 스크롤(임시))
const review = async (req, res) => {
  try {
    //   //페이지의 시작 값을 받음(테이터의 총개수)
    //   const data = req.body;
    //   //시작을 지정할 변수 선언
    //   let start = 0;

    //   //이미데이터가 넘어가서 있는지 확인
    //   if (data.start <= 0) {
    //     start = 0;
    //   } else {
    //     start = data.start - 1;
    //   }
    //   //마지막 값 지정
    //   let last = start + 5;
    const review = await Review.find({}).sort("-createdAt");
    //.limit(start, last);
    res.json({ review });
  } catch (err) {
    console.error(err);
    next(err);
  }
};

// 리뷰 상세조회
const review_detail = async (req, res) => {
  // middlewares유저정보 가져오기(닉네임,프로필이미지)
  const { user } = res.locals;
  const nickname = user.nickname;
  const profileUrl = user.profileUrl;
  console.log("user", user);
  console.log("nickname", nickname);
  console.log("profileUrl", profileUrl);
  try {
    const { reviewId } = req.params;
    console.log(reviewId);
    const review_detail = await Review.find({ reviewId }).sort("-createdAt");
    res.json({ review_detail, nickname, profileUrl });
  } catch (err) {
    console.error(err);
    next(err);
  }
};

//리뷰 작성
const review_write = async (req, res) => {
  // middlewares유저정보 가져오기
  const { user } = res.locals;
  console.log("user", user);
  const userId = user.userId;
  console.log("userId", userId);
  const nickname = user.nickname;
  console.log("nickname", nickname);

  //작성한 정보 가져옴
  const { category, reviewTitle, reviewContent } = req.body;
  console.log(category, reviewTitle, reviewContent); //ok

  // 이미지에서 location정보만 저장해줌
  let imageUrl = new Array();
  for (let i = 0; i < req.files.length; i++) {
    imageUrl.push(req.files[i].location);
  }

  //uuid를 사용하여 고유값인 reviewId 생성
  const reviewId = uuid();

  // 리뷰작성시각 생성
  require("moment-timezone");
  moment.tz.setDefault("Asia/Seoul");
  const createdAt = String(moment().format("YYYY-MM-DD HH:mm:ss"));

  try {
    const ReviewList = await Review.create({
      reviewId,
      category,
      userId,
      nickname,
      reviewTitle,
      imageUrl,
      reviewContent,
      createdAt,
    });
    //res.send({ result: "success", ReviewList });
    res.status(200).json({
      respons: "success",
      ReviewList,
    });
  } catch {
    res.status(400).send({ msg: "리뷰가 작성되지 않았습니다." });
  }
};

//리뷰 수정
const review_modify = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { category, reviewTitle, reviewContent } = req.body;

    //게시글 내용이 없으면 저장되지 않고 alert 뜨게하기.
    if (!reviewContent.length) {
      res.status(401).send({ msg: "게시글 내용을 입력해주세요." });
      return;
    }
    // 이미지 수정
    const photo = await Review.find({ reviewId }); // 현재 URL에 전달된 id값을 받아서 db찾음
    //console.log("photo", photo); //ok
    const img = photo[0].imageUrl;

    //key 값을 저장 array
    let deleteItems = [];

    //key값 추출위한 for문
    for (let i = 0; i < img.length; i++) {
      //key값을 string으로 지정
      deleteItems.push({ Key: String(img[i].split("/")[3]) });
    }

    // s3 delete를 위한 option
    let params = {
      Bucket: "hyewonblog",
      Delete: {
        Objects: deleteItems,
        Quiet: false,
      },
    };

    //option을 참조 하여 delete 실행
    s3.deleteObjects(params, function (err, data) {
      if (err) console.log(err);
      else console.log("Successfully deleted myBucket/myKey");
    });

    //여러장 이미지 저장
    let imageUrl = new Array();
    for (let i = 0; i < req.files.length; i++) {
      imageUrl.push(req.files[i].location);
    }
    if (reviewId) {
      //업데이트
      await Review.updateOne(
        { reviewId },
        {
          $set: {
            category,
            reviewTitle,
            reviewContent,
            imageUrl,
          },
        }
      );
      res.status(200).send({
        respons: "success",
        msg: "수정 완료",
      });
    }
  } catch (error) {
    res.status(400).send({
      respons: "fail",
      msg: "수정 실패",
    });
  }
};

//리뷰 삭제
const review_delete = async (req, res) => {
  const { reviewId } = req.params;

  //try {
  // 이미지 URL 가져오기 위한 로직
  const photo = await Review.find({ reviewId });
  console.log("photo", photo); //ok
  const img = photo[0].imageUrl;
  console.log("img", img);
  //const img = photo[0].imageUrl[0].location;

  // 복수의 이미지를 삭제 변수(array)
  let deleteItems = [];

  //imageUrl이 array이 때문에 접근하기 위한 for문
  for (let i = 0; i < img.length; i++) {
    console.log("Aaa", img[i]);
    // 추가하기 위한 코드(string으로 해야 접근 가능)
    deleteItems.push({ Key: String(img[i].split("/")[3]) });
  }
  console.log("deleteItems", deleteItems);

  //삭제를 위한 변수
  let params = {
    //bucket 이름
    Bucket: "hyewonblog",
    //delete를 위한 key값
    Delete: {
      Objects: deleteItems,
      Quiet: false,
    },
  };

  //복수의 delete를 위한 코드 변수(params를 받음)
  s3.deleteObjects(params, function (err, data) {
    if (err) console.log(err);
    else console.log("Successfully deleted myBucket/myKey");
  });

  //delete
  await Review.deleteOne({ reviewId });
  res.status(200).send({
    respons: "success",
    msg: "삭제 완료",
  });

  //} catch (error) {
  // res.status(400).send({
  //   respons: "fail",
  //   msg: "삭제 실패",
  // });
};
//};

module.exports = {
  review,
  review_detail,
  review_write,
  review_modify,
  review_delete,
};
